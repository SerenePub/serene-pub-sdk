/**
 * Sample core contracts — what /contracts would generate.
 *
 * Every entry is a descriptor plus a pinned constructor. Note that the LLM, TTS and
 * image-gen providers are structurally identical: `params` is declared per type, so
 * nothing anywhere switches on modality (17 §1).
 */
import type { FieldDecl, SlotDecl } from '@serene-pub/sdk';
/**
 * What a turn is *about*: this chat, and whose turn it is.
 *
 * `sessionScope` bundles both and is what the queries take, but neither was
 * readable on its own — so a node that needs only the speaker had to accept the
 * whole scope and reach into it, and `currentCharacterId` ended up travelling
 * on `HostScope` instead of through the graph because there was no port to
 * carry it. Hidden state in a run that otherwise records everything.
 *
 * The two scalars are ports now. `sessionScope` stays: a query wanting both should
 * take one thing, not reassemble it.
 */
export declare const userMessage: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    sessionScope: string;
    sessionId: string;
    /** Null on a narrator turn — nobody in particular is speaking. */
    characterId: string;
    /**
     * Values for the mode's declared `fields` (19 §1), filtered to
     * the declared schema keys — the supply side of the round
     * trip: declaration → chat settings → chat row → this port →
     * every downstream node.
     */
    fields: string;
    /**
     * Text an in-progress reply has already produced, when this turn
     * is a **continue** (ruling 2026-09-08, D-2).
     *
     * Empty on every other turn, which is nearly all of them. It is
     * here rather than on a `continue`-only input type because a
     * continue is the standard chat's own verb — it answers the same
     * event, in the same session, from the same cast — and a second
     * input type would restate this one's `sessionShape`, which is
     * the thing `side-character-turn@1`'s note says a shape-bearing
     * mode must never have copied.
     *
     * ⚠ It is not the triggering text and it is not a message. `text`
     * stays what it would be on an ordinary turn, the row carrying
     * this is excluded from every message read while it generates,
     * and only `core:task/process-messages@1` consumes it — as the
     * body of the seed line the model continues from.
     */
    continuationPrefill: string;
}, import("@serene-pub/sdk").PortDecl, "core:input/user-message@1"> & {
    kind: 'input';
    slots?: {
        /**
         * The input hook (18 §4a): user chains over the triggering text,
         * phase `after` on what this node publishes — which is what
         * lorebook scanning and the prompt's seed see. The stored user
         * message was written before the turn began and stays untouched
         * by construction; the slot description says so because that is
         * the question the control raises.
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:text/transform@1"];
            readonly port: "text";
            readonly phase: "after";
            readonly description: "Scripts over the message that triggered this turn — expand shorthand, resolve dice notation — as retrieval and the prompt will see it. The stored message is not changed.";
        };
    } | undefined;
}>;
/**
 * A message that already exists — the trigger carries its id.
 *
 * `messageId` is `row-ids@1` rather than `json` because it *is* a row id, and typing it
 * as one is what makes `updateMessage` wireable at all: the id an update is allowed to
 * take is the id of a row that already exists, which is exactly what an event about an
 * existing message carries (13 §10b).
 */
export declare const messageCreated: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messageId: string;
}, import("@serene-pub/sdk").PortDecl, "core:input/message-created@1"> & {
    kind: 'input';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * A session was just created — the create pipeline's trigger (24 §5, §12).
 *
 * The genre's one required pipeline answers this event and seeds the
 * session's initial data: greetings per the genre's shape, initial channels,
 * initial state. The payload is the create request itself — the genre, the
 * chosen preset, the participants and initial field values — because what a
 * create pipeline does is *finish* what the request began.
 *
 * Not `user-message`: reusing the turn input here welded creation to the
 * chat turn's shape and was wrong (24 §12). A create run has no triggering
 * text and no speaker; it has a request.
 */
export declare const sessionCreated: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    sessionScope: string;
    sessionId: string;
    /**
     * The create request: genre id, preset id, participant ids,
     * lorebook, initial field values — everything the person chose
     * before the session existed.
     */
    request: string;
    /** Values for the genre's declared fields, filtered to the schema. */
    fields: string;
}, import("@serene-pub/sdk").PortDecl, "core:input/session-created@1"> & {
    kind: 'input';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Who is about to speak, when the trigger picked somebody who is **not** in
 * the cast — the side-character narration turn (ruling 2026-09-07).
 *
 * ## participant ≠ character
 *
 * A side character is a **participant without a turn slot**. The trigger's
 * first step accepts either an existing character (`characterId`) or a name
 * somebody typed (`speakerName` alone), and both are full participants *for
 * that turn* — the prompt is written from their perspective and the seed line
 * carries their name. Neither joins the session cast, and nothing here writes
 * a `session_characters` row: this input publishes a fact about one turn, and
 * a fact is not a membership.
 *
 * Its own type rather than a flag on `user-message@1`, for the reason that type
 * already gives about the narrator: the type is the unit that declares a
 * configurable surface, and `user-message` is the standard chat's **mode** —
 * it carries the genre's `sessionShape`, which is exactly what a side-character
 * turn must not restate. This one declares no shape, so it is an action input
 * and never a session mode.
 *
 * ## The new-name hook (the fact, and only the fact)
 *
 * `speaker` carries `known` — whether the chosen name matches anything in the
 * session's lorebook — and the scripts hook below declares it as an **extra**,
 * so a script attached there reads it through the one dispatch core scripts and
 * extension hooks already share. Core states the fact and offers the hook; what
 * a script *does* about an unknown name (suggest adding them, stay quiet, add a
 * note to the prompt) is the script's business, not this declaration's. There is
 * deliberately no second path: nothing here notifies, writes, or prompts.
 */
export declare const sideCharacterTurn: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    sessionScope: string;
    sessionId: string;
    /**
     * The chosen character, or null for a free-form name.
     *
     * ⚠ It is **not** a turn slot. It reaches character lore's
     * visibility rule (an entry bound to this character becomes
     * readable for this turn) and the prompt's perspective, and
     * nothing else — round-robin selection reads the session's
     * cast and its messages, neither of which this touches.
     */
    characterId: string;
    /**
     * The speaker as a whole fact: `{ name, characterId, known }`.
     *
     * A port rather than only an extra, because it is what the
     * context builder is wired to and what the receipt records —
     * "why did this turn sound like Vell" is answerable from the
     * run afterwards rather than from the trigger that started it.
     */
    speaker: string;
    /** Values for the genre's declared fields, filtered to the schema. */
    fields: string;
}, import("@serene-pub/sdk").PortDecl, "core:input/side-character-turn@1"> & {
    kind: 'input';
    slots?: {
        /**
         * The input hook (18 §4a), on the same terms as `user-message@1`:
         * user chains over the triggering text, phase `after` on what this
         * node publishes, which is what retrieval and the prompt see.
         *
         * ⚠ `extras` is what makes this the **new-name hook**. The three
         * names below are read-only context supplied by the host at the
         * hook (18 §6a) and are part of the fixed choice set the script
         * editor offers — so "this name is new" is a declared read rather
         * than a name typed on faith. `speakerIsKnown` is `false` exactly
         * when a free-form name matched nothing in the session's lorebook.
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:text/transform@1"];
            readonly port: "text";
            readonly phase: "after";
            readonly extras: ["speakerName", "speakerCharacterId", "speakerIsKnown", "castNames"];
            readonly description: "Scripts over the instructions this turn was triggered with, as retrieval and the prompt will see them. The speaker rides along read-only — including whether the lorebook already knows them, so a script can offer to add somebody new.";
        };
    } | undefined;
}>;
export declare const sessionHistory: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messages: string;
}, {
    scope: string;
    budget: string;
}, "core:query/session-history@1"> & {
    kind: 'query';
    slots?: {
        /**
         * ⚠ No `template` slot, and there was one.
         *
         * It declared "how each chat message is written into the context",
         * and three things were true of it: no binding ever read it, no row
         * was ever seeded for its pool, and so the panel rendered a picker
         * with **nothing in it** on every pipeline that used this node. A
         * control that cannot be given a value and would not be used if it
         * could is worse than the absence of the feature — the same
         * judgement `variableLayouts.ts` records about a layout for
         * `characterLore`.
         *
         * If per-message wording becomes configurable, it belongs on
         * `core:task/process-messages@1`, which is what actually formats a
         * line. This node fetches rows.
         */
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * ⚠ The default is **100 because 100 is what every install
                 * has been getting**, not because 100 was chosen.
                 *
                 * It read 40 here and nothing read it: the binding took
                 * `input.limit`, a key nothing supplies, and fell through to
                 * a literal 100 on every run. Wiring the control while
                 * leaving the declared number at 40 would have moved the
                 * transcript window from 100 to 40 on every install at
                 * defaults — a retrieval change smuggled in behind a typing
                 * fix. So the declaration is corrected to the effective
                 * value first; changing the number is a separate decision,
                 * made against the measure corpus.
                 *
                 * Exactly the ruling `topK` got (2026-09-07), for exactly
                 * the same defect.
                 */
                readonly limit: {
                    readonly type: "integer";
                    readonly default: 100;
                    readonly description: "How many recent messages are considered for the context.";
                };
                /**
                 * The channel this history reads (20 §7). A session's
                 * lanes are the mode's declaration; a pipeline chooses
                 * which one builds its context — the map narrator reads
                 * `map`, the chat pipeline reads `main`, and a custom
                 * spec may do otherwise on purpose.
                 */
                readonly channel: {
                    readonly type: "string";
                    readonly default: "main";
                    readonly description: "Which of the session's channels this history reads. The chat log is 'main'.";
                };
                /**
                 * ⚠ `weight: 0.4` and `minInclude: 6` were here and are
                 * gone. Both were answers to "how does chat history fare
                 * against everything else", which is a question about the
                 * *ranking*, and a node that fetches rows cannot see
                 * everything else to answer it: the weight sat beside
                 * `rank`'s `share`, free to disagree with it, and the
                 * floor was the only one of five sources that had one.
                 * They are `share.messages` and `minEntries.messages` on
                 * `core:task/rank-hybrid@1` now, beside their peers.
                 */
                readonly priority: {
                    readonly type: "enum";
                    readonly of: readonly ["low", "normal", "high", "always"];
                    readonly default: "normal";
                    readonly description: "How strongly history resists being trimmed — 'always' is never dropped.";
                };
            };
        };
    } | undefined;
}>;
export declare const lorebookTriggers: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
}, {
    text: string;
    scope: string;
}, "core:query/lorebook-triggers@1"> & {
    kind: 'query';
    slots?: {
        /**
         * ⚠ No `template` slot, and there was one — a *source* template for
         * "how one triggered entry is written into the context".
         *
         * Nothing read it and nothing seeded a row for it, so it rendered as
         * an empty picker. The node that exists to do this job is
         * `core:task/render-entries@1`, which keeps its own template slot
         * and is where the feature should land when something binds it; two
         * declarations of one idea, one of them inert, is how they drift.
         */
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value the
                 * scan actually ran on while this declaration said 3 and
                 * nothing read it.
                 *
                 * Round-sized on purpose. A group session with five
                 * characters takes five messages to come back round, so a
                 * depth of 3 cannot see the turn it belongs to: the window
                 * has already slid past where the round began. Scan depth
                 * has to be at least a round, and a round grows with the
                 * cast.
                 */
                readonly scanDepth: {
                    readonly type: "integer";
                    readonly default: 10;
                    readonly i18n: {
                        readonly en: "Messages scanned for keywords";
                    };
                    readonly description: "How many recent messages are scanned for lorebook keywords.";
                };
                /**
                 * On this type as well as on `loreSlots`, for the reason its
                 * three siblings below give: the narrator runs its lore
                 * through this type, and this number reaches the same
                 * `keywordQuery` from the same `retrievalParamsFrom` seam —
                 * so a control that exists on the reply pipeline and not on
                 * the narrator is a difference no user could discover a
                 * reason for.
                 */
                readonly guaranteedMessages: {
                    readonly type: 'integer';
                    readonly default: 10;
                    readonly min: 1;
                    readonly i18n: {
                        readonly en: 'Messages that count as "now"';
                    };
                    readonly description: 'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.';
                };
                /**
                 * The ceiling, spelled the way its three siblings spell it.
                 *
                 * ⚠ This was `recursionDepth`, and the one letter of
                 * difference is why it looked wired and was not:
                 * `retrievalParamsFrom` reads `maxRecursionDepth`, so the
                 * number this node stored was handed to nothing and the
                 * narrator ran on `DEFAULT_RETRIEVAL` whatever anybody
                 * typed. `narrate@1.10.0`'s own note says "Scan Depth and
                 * Max Recursion Depth rendered, validated and saved here
                 * without ever being read" — half of that was fixed by
                 * wiring the slot, and this is the other half, because the
                 * control it names was never called that here.
                 *
                 * Renamed rather than read under both spellings: two names
                 * for one ceiling is how the four lore types drift apart
                 * again, and `loreSlots` below has the older claim on the
                 * name. Migration 0195 carries the stored values across so
                 * a number somebody typed keeps its meaning — it simply
                 * starts working, which is the 0186 rule.
                 *
                 * Same default and same words as `loreSlots`': the narrator
                 * runs its lore through this type, and a ceiling that
                 * exists on the reply pipeline and not on the narrator is a
                 * difference no user could discover a reason for.
                 */
                readonly maxRecursionDepth: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly i18n: {
                        readonly en: "Follow keyword chains this deep";
                    };
                    readonly description: "A ceiling on how far entries may trigger further entries via keywords found in their text, however deep an individual entry asks to go. It never follows links between entries.";
                };
                /**
                 * ⚠ `caseSensitive`, `useRegex`, `weight` and `minInclude`
                 * were here, and are gone rather than wired. All four
                 * rendered, validated, stored a row and resolved through
                 * every scope layer while `retrievalParamsFrom` read none
                 * of them — plan bug 15, and the last of the dead-control
                 * clusters bug 12 found the first of.
                 *
                 * They divide cleanly in two, and neither half is a control
                 * this node should own:
                 *
                 *   · `caseSensitive` and `useRegex` describe how an *entry*
                 *     matches. `loreSlots` below already states the rule —
                 *     the entry is what somebody is looking at when they
                 *     want to change that — and the entry is where they
                 *     live: `signals.ts` reads `entry.caseSensitive` and
                 *     folds `entry.useRegex` into `entry.matchMode`, both
                 *     columns with their own editor control. A node-level
                 *     copy could only ever be a second answer to a question
                 *     the row already answers.
                 *   · `weight` and `minInclude` are the ranker's, and this
                 *     is the same pair `core:query/session-history@1` lost
                 *     for the same reason: they ask how one source fares
                 *     against everything else, and a node that fetches rows
                 *     cannot see everything else to answer it. They are
                 *     `share` / `signal*` and `minEntries` on
                 *     `core:task/rank-hybrid@1` now, beside their peers,
                 *     where a share is normalised against the others rather
                 *     than free to disagree with them.
                 *
                 * Deleting an address culls it: `reconcileConfigs` removes
                 * the stored value and writes a notice carrying what it
                 * was, which the admin workspace renders. That is the
                 * whole reason a cull is allowed to be the answer here —
                 * before the notices surface had a reader, "delete it" and
                 * "lose it silently" were the same act.
                 */
                readonly admitThreshold: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: 'Find without keywords';
                    };
                    readonly description: {
                        readonly en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.';
                    };
                };
                /**
                 * The three lexical-quality controls, on this type as well
                 * as on `loreSlots` and for `admitThreshold`'s reason: the
                 * narrator runs its lore through this type, and a control
                 * that exists on the reply pipeline and not on the narrator
                 * is a difference no user could discover a reason for.
                 */
                readonly lexicalScoring: {
                    readonly type: 'enum';
                    readonly default: 'overlap';
                    readonly i18n: {
                        readonly en: 'Relevance balance';
                    };
                    readonly members: readonly [{
                        readonly key: 'overlap';
                        readonly i18n: {
                            readonly en: 'Raw overlap';
                        };
                        readonly description: {
                            readonly en: 'Every repeat of a word counts again, so a longer entry has more chances to score.';
                        };
                    }, {
                        readonly key: 'balanced';
                        readonly i18n: {
                            readonly en: 'Length-aware';
                        };
                        readonly description: {
                            readonly en: 'A repeated word stops adding as much, and an entry is judged against how long lorebook entries usually are. Better when entries differ a lot in length.';
                        };
                    }];
                    readonly description: {
                        readonly en: "How an entry's own wording is weighed when deciding how relevant it is to what is being said.";
                    };
                };
                readonly trigramFolding: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly i18n: {
                        readonly en: 'Match near-misses';
                    };
                    readonly description: {
                        readonly en: 'How much a keyword that is nearly present counts — a different ending, a typo, or a language that does not put spaces between words. 0 requires an exact match; try 0.5 to turn it on.';
                    };
                };
                readonly titleWeight: {
                    readonly type: 'number';
                    readonly default: 1;
                    readonly min: 0;
                    readonly max: 5;
                    readonly i18n: {
                        readonly en: 'Title counts extra';
                    };
                    readonly description: {
                        readonly en: "How much more a word in an entry's title counts than the same word among its keywords. 1 treats them alike.";
                    };
                };
            };
        };
    } | undefined;
}>;
export declare const worldLore: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
}, {
    text: string;
    scope: string;
}, "core:query/world-lore@1"> & {
    kind: 'query';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                /**
                 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value every scan
                 * has actually run on. This said 3 for as long as the three lore
                 * lanes shipped without a wired `params` slot, so the number was
                 * never handed to anything and the two could not be seen to
                 * disagree.
                 *
                 * Round-sized on purpose. A group session with five characters
                 * takes five messages to come back round, so a depth of 3 cannot
                 * see the turn it belongs to: the window has already slid past
                 * where the round began. Scan depth has to be at least a round,
                 * and a round grows with the cast.
                 */
                scanDepth: {
                    type: 'integer';
                    default: number;
                    quick: boolean;
                    i18n: {
                        en: string;
                    };
                    description: string;
                };
                /**
                 * Beside `scanDepth` because the pair is only legible together:
                 * one is how far back a key may fire from, the other is how much
                 * conversation counts as the present moment. See
                 * `GUARANTEED_MESSAGES`.
                 */
                guaranteedMessages: {
                    readonly type: 'integer';
                    readonly default: 10;
                    readonly min: 1;
                    readonly i18n: {
                        readonly en: 'Messages that count as "now"';
                    };
                    readonly description: 'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.';
                };
                maxRecursionDepth: {
                    type: 'integer';
                    default: number;
                    i18n: {
                        en: string;
                    };
                    description: string;
                };
                /**
                 * On all three lanes rather than on one, because the question it
                 * answers is per-source: world lore without keys is the case this
                 * exists for, character lore is already narrowed to whoever is
                 * speaking, and dated history is the source most likely to want a
                 * stricter setting than the other two. One shared declaration, one
                 * row per lane — which is what `share`, `maxEntries` and the rest
                 * of the retrieval surface already do.
                 */
                admitThreshold: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: 'Find without keywords';
                    };
                    readonly description: {
                        readonly en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.';
                    };
                };
                /**
                 * On all three lanes for `admitThreshold`'s reason, and with a
                 * per-source answer of its own in each case: world lore is where
                 * entry lengths differ most, character lore is already narrowed to
                 * whoever is speaking, and dated history has no title at all — so
                 * `titleWeight` is a control history renders and cannot move,
                 * which is the honest state rather than a fourth declaration.
                 */
                lexicalScoring: {
                    readonly type: 'enum';
                    readonly default: 'overlap';
                    readonly i18n: {
                        readonly en: 'Relevance balance';
                    };
                    readonly members: readonly [{
                        readonly key: 'overlap';
                        readonly i18n: {
                            readonly en: 'Raw overlap';
                        };
                        readonly description: {
                            readonly en: 'Every repeat of a word counts again, so a longer entry has more chances to score.';
                        };
                    }, {
                        readonly key: 'balanced';
                        readonly i18n: {
                            readonly en: 'Length-aware';
                        };
                        readonly description: {
                            readonly en: 'A repeated word stops adding as much, and an entry is judged against how long lorebook entries usually are. Better when entries differ a lot in length.';
                        };
                    }];
                    readonly description: {
                        readonly en: "How an entry's own wording is weighed when deciding how relevant it is to what is being said.";
                    };
                };
                trigramFolding: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly i18n: {
                        readonly en: 'Match near-misses';
                    };
                    readonly description: {
                        readonly en: 'How much a keyword that is nearly present counts — a different ending, a typo, or a language that does not put spaces between words. 0 requires an exact match; try 0.5 to turn it on.';
                    };
                };
                titleWeight: {
                    readonly type: 'number';
                    readonly default: 1;
                    readonly min: 0;
                    readonly max: 5;
                    readonly i18n: {
                        readonly en: 'Title counts extra';
                    };
                    readonly description: {
                        readonly en: "How much more a word in an entry's title counts than the same word among its keywords. 1 treats them alike.";
                    };
                };
            };
        };
    } | undefined;
}>;
export declare const characterLore: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
}, {
    text: string;
    scope: string;
}, "core:query/character-lore@1"> & {
    kind: 'query';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                /**
                 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value every scan
                 * has actually run on. This said 3 for as long as the three lore
                 * lanes shipped without a wired `params` slot, so the number was
                 * never handed to anything and the two could not be seen to
                 * disagree.
                 *
                 * Round-sized on purpose. A group session with five characters
                 * takes five messages to come back round, so a depth of 3 cannot
                 * see the turn it belongs to: the window has already slid past
                 * where the round began. Scan depth has to be at least a round,
                 * and a round grows with the cast.
                 */
                scanDepth: {
                    type: 'integer';
                    default: number;
                    quick: boolean;
                    i18n: {
                        en: string;
                    };
                    description: string;
                };
                /**
                 * Beside `scanDepth` because the pair is only legible together:
                 * one is how far back a key may fire from, the other is how much
                 * conversation counts as the present moment. See
                 * `GUARANTEED_MESSAGES`.
                 */
                guaranteedMessages: {
                    readonly type: 'integer';
                    readonly default: 10;
                    readonly min: 1;
                    readonly i18n: {
                        readonly en: 'Messages that count as "now"';
                    };
                    readonly description: 'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.';
                };
                maxRecursionDepth: {
                    type: 'integer';
                    default: number;
                    i18n: {
                        en: string;
                    };
                    description: string;
                };
                /**
                 * On all three lanes rather than on one, because the question it
                 * answers is per-source: world lore without keys is the case this
                 * exists for, character lore is already narrowed to whoever is
                 * speaking, and dated history is the source most likely to want a
                 * stricter setting than the other two. One shared declaration, one
                 * row per lane — which is what `share`, `maxEntries` and the rest
                 * of the retrieval surface already do.
                 */
                admitThreshold: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: 'Find without keywords';
                    };
                    readonly description: {
                        readonly en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.';
                    };
                };
                /**
                 * On all three lanes for `admitThreshold`'s reason, and with a
                 * per-source answer of its own in each case: world lore is where
                 * entry lengths differ most, character lore is already narrowed to
                 * whoever is speaking, and dated history has no title at all — so
                 * `titleWeight` is a control history renders and cannot move,
                 * which is the honest state rather than a fourth declaration.
                 */
                lexicalScoring: {
                    readonly type: 'enum';
                    readonly default: 'overlap';
                    readonly i18n: {
                        readonly en: 'Relevance balance';
                    };
                    readonly members: readonly [{
                        readonly key: 'overlap';
                        readonly i18n: {
                            readonly en: 'Raw overlap';
                        };
                        readonly description: {
                            readonly en: 'Every repeat of a word counts again, so a longer entry has more chances to score.';
                        };
                    }, {
                        readonly key: 'balanced';
                        readonly i18n: {
                            readonly en: 'Length-aware';
                        };
                        readonly description: {
                            readonly en: 'A repeated word stops adding as much, and an entry is judged against how long lorebook entries usually are. Better when entries differ a lot in length.';
                        };
                    }];
                    readonly description: {
                        readonly en: "How an entry's own wording is weighed when deciding how relevant it is to what is being said.";
                    };
                };
                trigramFolding: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly i18n: {
                        readonly en: 'Match near-misses';
                    };
                    readonly description: {
                        readonly en: 'How much a keyword that is nearly present counts — a different ending, a typo, or a language that does not put spaces between words. 0 requires an exact match; try 0.5 to turn it on.';
                    };
                };
                titleWeight: {
                    readonly type: 'number';
                    readonly default: 1;
                    readonly min: 0;
                    readonly max: 5;
                    readonly i18n: {
                        readonly en: 'Title counts extra';
                    };
                    readonly description: {
                        readonly en: "How much more a word in an entry's title counts than the same word among its keywords. 1 treats them alike.";
                    };
                };
            };
        };
    } | undefined;
}>;
/**
 * Dated summaries of earlier events.
 *
 * ⚠ **This lane did not exist between spec 1.8.0 and 1.10.0, and history was
 * silently absent from every prompt in that window.**
 *
 * `lorebook-triggers@1` returned all three sources through one port. Splitting
 * world and character lore into two nodes replaced it with two lanes that each
 * filter the shared scan to their own `source` — and nothing filtered for
 * `history`, so those candidates were built, scored, and then dropped on the
 * floor. Nothing failed: the ranker kept a `history` band, `assemble` kept
 * asking for history blocks, and both got nothing.
 *
 * The parity corpus stayed green throughout because its harness renders through
 * `lorebook-triggers@1` rather than the shipped document — the exact divergence
 * a comment in that file warns about. The corpus mirrors the three lanes now.
 *
 * Same retrieval as its two siblings: one scan, one filter.
 */
export declare const historyEntries: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
}, {
    text: string;
    scope: string;
}, "core:query/history-entries@1"> & {
    kind: 'query';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                /**
                 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value every scan
                 * has actually run on. This said 3 for as long as the three lore
                 * lanes shipped without a wired `params` slot, so the number was
                 * never handed to anything and the two could not be seen to
                 * disagree.
                 *
                 * Round-sized on purpose. A group session with five characters
                 * takes five messages to come back round, so a depth of 3 cannot
                 * see the turn it belongs to: the window has already slid past
                 * where the round began. Scan depth has to be at least a round,
                 * and a round grows with the cast.
                 */
                scanDepth: {
                    type: 'integer';
                    default: number;
                    quick: boolean;
                    i18n: {
                        en: string;
                    };
                    description: string;
                };
                /**
                 * Beside `scanDepth` because the pair is only legible together:
                 * one is how far back a key may fire from, the other is how much
                 * conversation counts as the present moment. See
                 * `GUARANTEED_MESSAGES`.
                 */
                guaranteedMessages: {
                    readonly type: 'integer';
                    readonly default: 10;
                    readonly min: 1;
                    readonly i18n: {
                        readonly en: 'Messages that count as "now"';
                    };
                    readonly description: 'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.';
                };
                maxRecursionDepth: {
                    type: 'integer';
                    default: number;
                    i18n: {
                        en: string;
                    };
                    description: string;
                };
                /**
                 * On all three lanes rather than on one, because the question it
                 * answers is per-source: world lore without keys is the case this
                 * exists for, character lore is already narrowed to whoever is
                 * speaking, and dated history is the source most likely to want a
                 * stricter setting than the other two. One shared declaration, one
                 * row per lane — which is what `share`, `maxEntries` and the rest
                 * of the retrieval surface already do.
                 */
                admitThreshold: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: 'Find without keywords';
                    };
                    readonly description: {
                        readonly en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.';
                    };
                };
                /**
                 * On all three lanes for `admitThreshold`'s reason, and with a
                 * per-source answer of its own in each case: world lore is where
                 * entry lengths differ most, character lore is already narrowed to
                 * whoever is speaking, and dated history has no title at all — so
                 * `titleWeight` is a control history renders and cannot move,
                 * which is the honest state rather than a fourth declaration.
                 */
                lexicalScoring: {
                    readonly type: 'enum';
                    readonly default: 'overlap';
                    readonly i18n: {
                        readonly en: 'Relevance balance';
                    };
                    readonly members: readonly [{
                        readonly key: 'overlap';
                        readonly i18n: {
                            readonly en: 'Raw overlap';
                        };
                        readonly description: {
                            readonly en: 'Every repeat of a word counts again, so a longer entry has more chances to score.';
                        };
                    }, {
                        readonly key: 'balanced';
                        readonly i18n: {
                            readonly en: 'Length-aware';
                        };
                        readonly description: {
                            readonly en: 'A repeated word stops adding as much, and an entry is judged against how long lorebook entries usually are. Better when entries differ a lot in length.';
                        };
                    }];
                    readonly description: {
                        readonly en: "How an entry's own wording is weighed when deciding how relevant it is to what is being said.";
                    };
                };
                trigramFolding: {
                    readonly type: 'number';
                    readonly default: 0;
                    readonly min: 0;
                    readonly max: 1;
                    readonly i18n: {
                        readonly en: 'Match near-misses';
                    };
                    readonly description: {
                        readonly en: 'How much a keyword that is nearly present counts — a different ending, a typo, or a language that does not put spaces between words. 0 requires an exact match; try 0.5 to turn it on.';
                    };
                };
                titleWeight: {
                    readonly type: 'number';
                    readonly default: 1;
                    readonly min: 0;
                    readonly max: 5;
                    readonly i18n: {
                        readonly en: 'Title counts extra';
                    };
                    readonly description: {
                        readonly en: "How much more a word in an entry's title counts than the same word among its keywords. 1 treats them alike.";
                    };
                };
            };
        };
    } | undefined;
}>;
/** Probability rolls come from the run seed, so they replay (13 §7i). */
export declare const lorebookProbabilistic: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
}, {
    text: string;
}, "core:query/lorebook-probabilistic@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const vectorSearch: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
    /** One ranked list per query vector, in the order they were given. */
    lists: string;
    /**
     * `cos(i, j)` over `hits`, by index. What MMR needs, without any
     * embedding leaving the host.
     */
    similarity: string;
}, {
    /** Several query vectors, one ranked list each. */
    vectors: string;
    scope: string;
}, "core:query/vector-search@1"> & {
    kind: 'query';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * ⚠ **0 is off, and is the shipped default** — the
                 * convention `maxRecursionDepth`, `admitThreshold` and
                 * `entity-search`'s own caps use, for their reason: this
                 * changes what reaches the model, so it is turned on rather
                 * than arrived at on upgrade.
                 *
                 * A **cap on what this mechanism contributes**, not a cap on what
                 * it looks at — `topK` is that, one field down. The two are
                 * different questions and only this one decides whether the
                 * mechanism is running at all.
                 */
                readonly maxEntries: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly min: 0;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: "Entries found by meaning";
                    };
                    readonly description: "How many lorebook entries this may bring in for being about what the conversation is about, rather than for matching a keyword. Needs an embedding model; 0 turns the whole arm off, try 5. A pipeline that ranks this arm separately reads its per-query lists instead, which this does not cut.";
                };
                /**
                 * ⚠ **40, and it was 12.** The number never reached the
                 * host: the binding read `input?.topK` — an *in-port* name
                 * this node does not declare — and fell through to a
                 * literal `?? 40` on every run since the mechanism was
                 * written. So 40 is the value every install has actually
                 * been searching at, and 12 is a number that was rendered,
                 * validated, saved and resolved through the whole scope
                 * chain without ever being handed to anything.
                 *
                 * Defaulted to the effective behaviour rather than to the
                 * declared one on purpose. Wiring a control is not a licence
                 * to re-tune every install that never touched it: the fix is
                 * that the number now *means* something, and it means what
                 * it has been doing.
                 *
                 * A cap on what each query *looks at*, which is a different
                 * question from `maxEntries` one field up — that one caps
                 * what the mechanism *contributes*. Raising this widens the
                 * pool the ranker's other signals get to score; raising
                 * `maxEntries` is what decides whether the mechanism runs at
                 * all.
                 */
                readonly topK: {
                    readonly type: "integer";
                    readonly default: 40;
                    readonly min: 1;
                    readonly i18n: {
                        readonly en: "Closest matches per query";
                    };
                    readonly description: "How many of the closest matches each retrieval query returns. A wider pool for the ranker to score, not a cap on what this arm contributes.";
                };
                /**
                 * How sharply a weak resemblance is discounted — and
                 * emphatically **not** a floor.
                 *
                 * ⚠ **This replaced `minScore: 0.35`, and the replacement is
                 * a ruling rather than a rename.** A minimum similarity
                 * removes a row from the pool outright, and a row that is not
                 * in the pool can no longer be found by keyword, by name or
                 * by proximity either — one mechanism's opinion silently
                 * disabling four others. The governing rule is that a weak or
                 * unavailable mechanism *subtracts a signal* and never
                 * removes a candidate, so the cutoff could not stay whatever
                 * number it was set to. (It was never read either; nothing
                 * anywhere consumed `minScore`.)
                 *
                 * What replaces it shapes the **contribution** instead:
                 *
                 *     semantic = cos ** similarityFalloff
                 *
                 * 1 is the raw cosine and is the off position. Above 1 the
                 * curve is convex, fixed at both ends (0→0, 1→1), so a
                 * near-miss loses most of its contribution while a strong
                 * match keeps nearly all of its own — and the row stays in
                 * the pool at every value, which is the whole point.
                 *
                 * ⚠ **Chosen as a shape because a threshold is not
                 * portable.** Cosine distributions are not comparable across
                 * embedding models: one model puts unrelated text at 0.1 and
                 * another at 0.6, so `0.35` means "almost everything" on the
                 * first and "almost nothing" on the second, and an install
                 * that swaps models silently changes what its lorebook
                 * retrieves. An exponent has no cliff to move. It is
                 * strictly monotonic, so it can never reorder this
                 * mechanism's own hits or turn one off — it only decides how
                 * much the semantic signal is allowed to outweigh a keyword
                 * that actually fired.
                 */
                readonly similarityFalloff: {
                    readonly type: "number";
                    readonly default: 1;
                    readonly min: 1;
                    readonly max: 8;
                    readonly i18n: {
                        readonly en: "Discount weak matches";
                    };
                    readonly description: "How sharply a loose resemblance counts for less than a close one. 1 takes the similarity as it comes; higher pushes vague matches down without ever removing them, so they can still be found by a keyword or a name.";
                };
            };
        };
    } | undefined;
}>;
/**
 * The third mechanism — retrieval by the names a scene is using.
 *
 * The keyword mechanism matches an author's written keys against a window; the vector
 * mechanism matches an embedding. This one matches **entities**: the characters,
 * places and things the recent conversation named, against the same entities
 * found in every lorebook entry and every earlier message. A peer of the other
 * two rather than a signal inside one, because it queries a different index and
 * ranks on a different question.
 *
 * Three things follow, and they are why it exists:
 *
 *  1. **It is how a book with no keywords works.** An entry nobody indexed is
 *     reached because the scene is naming the same people it names. The
 *     `admitThreshold` control on the lore nodes does this *inside* the keyword
 *     scan; this does it as a source of candidates in its own right.
 *  2. **It searches the transcript**, which nothing else does. The keyword scan
 *     reads only a bounded recent window and the semantic mechanism is not wired into
 *     the shipped pipeline, so retrieving an *older message* by what it was
 *     about has not been possible until now.
 *  3. **It needs no embedding model.** Names are matched, not encoded, so this
 *     is available on every install rather than only on the ones with a model
 *     loaded.
 *
 * It reads annotations written in the background, so it is cheap per turn: the
 * work of finding names in a lorebook happens when the lorebook is written, not
 * when a turn is taken.
 */
export declare const entitySearch: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
    /**
     * Earlier messages, as candidates in the `messages` band.
     *
     * A port of its own rather than part of `main`, because the two
     * are budgeted separately and a pipeline that wants lore found
     * by name almost certainly does not want half its context
     * window spent on retrieved transcript by accident.
     */
    messages: string;
}, {
    scope: string;
}, "core:query/entity-search@1"> & {
    kind: 'query';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * ⚠ **0 is off, and is the shipped default** — the
                 * convention `maxRecursionDepth` and `admitThreshold` use,
                 * and for the same reason: this changes what reaches the
                 * model, so it is turned on rather than arrived at on
                 * upgrade.
                 */
                readonly maxEntries: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly min: 0;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: "Entries found by name";
                    };
                    readonly description: "How many lorebook entries this may bring in because the conversation is naming the same people, places and things they do. 0 turns it off; try 5.";
                };
                /**
                 * Separate from `maxEntries`, because the two answer
                 * different questions and only one of them has somewhere to
                 * go today.
                 */
                readonly maxMessages: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly min: 0;
                    readonly i18n: {
                        readonly en: "Earlier messages found by name";
                    };
                    readonly description: "How many earlier messages this may return for naming what the scene is naming. The shipped pipelines do not place retrieved messages into the prompt yet — the conversation reaches the prompt as the verbatim recent window — so this returns them for a pipeline that wires them somewhere, and is off by default.";
                };
                readonly scanDepth: {
                    readonly type: "integer";
                    readonly default: 10;
                    readonly i18n: {
                        readonly en: "Messages read for names";
                    };
                    readonly description: "How many recent messages are read to decide what the scene is currently about.";
                };
                /**
                 * The mechanism's strength, and it is declared rather than
                 * constant because the graded overlap *compresses* what it
                 * measures: one strongly-shared name saturates around 0.63
                 * and two around 0.86, so a weight sized for a 0/1 signal
                 * would leave the improvement invisible.
                 *
                 * The default is deliberately the keyword weight: one thing
                 * the conversation is naming that not every entry names is
                 * worth about as much as one of an entry's own keys firing,
                 * and the saturation then keeps it strictly below a full
                 * keyword match — so authored keys still win, and this only
                 * ever adds.
                 */
                readonly entityWeight: {
                    readonly type: "number";
                    readonly default: 0.35;
                    readonly min: 0;
                    readonly max: 1;
                    readonly i18n: {
                        readonly en: "Strength";
                    };
                    readonly description: "How much weight a shared name carries against the other ways an entry can be found. 0 leaves the arm finding things and ranking them last.";
                };
            };
        };
    } | undefined;
}>;
/**
 * The mention detector — the query half of the entity-vector space.
 *
 * What the current scene refers to by **describing** it rather than by naming
 * it: *"the captain"*, *"the order"*, *"that bridge"*. Nothing in the lexical
 * stack can see these — no key matches them, no trigram folds them onto a
 * title, and the gazetteer has nothing to look up — and they are, as the plan
 * puts it, the references people actually write.
 *
 * A Query and not a Task, because the answer depends on the world's own
 * vocabulary: a description that turns out to be an authored lower-case name
 * (*"the ashguard"*) is dropped here, since the exact matcher owns it.
 */
export declare const mentionSpans: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The mentions with their offsets, for a receipt to point at. */
    mentions: string;
    /** The same strings in the same order, for the embed Provider. */
    texts: string;
}, {
    scope: string;
}, "core:query/mention-spans@1"> & {
    kind: 'query';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * ⚠ **0 is off, and is the shipped default** — the
                 * `maxRecursionDepth` / `admitThreshold` convention.
                 *
                 * **This is the entity-vector mechanism's one switch**, and it is
                 * on the first node of the chain on purpose: switched off,
                 * this returns before reading anything, `embed-text` is
                 * handed no texts and makes no model call, and `entity-link`
                 * returns before its own read. The mechanism costs literally
                 * nothing until somebody asks for it — not a message read,
                 * not an embedding.
                 *
                 * `entity-link.maxLinks` is therefore a ceiling rather than
                 * a second switch and ships non-zero: a feature whose two
                 * controls both default to off is one where turning the
                 * first one up appears to do nothing.
                 */
                readonly maxMentions: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly min: 0;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: "Descriptions to follow up";
                    };
                    readonly description: "How many descriptive references in the recent messages — \"the captain\", \"the order\" — are matched against what your entries are called, for entries no keyword reached. Needs an embedding model; 0 turns the whole arm off, try 4.";
                };
                readonly scanDepth: {
                    readonly type: "integer";
                    readonly default: 10;
                    readonly i18n: {
                        readonly en: "Messages read for descriptions";
                    };
                    readonly description: "How many recent messages are read for descriptions. A description points at what is being discussed now, so this is deliberately short.";
                };
            };
        };
    } | undefined;
}>;
/**
 * The entity-vector mechanism — mention → name linking.
 *
 * A second named vector space holding **one vector per name** rather than one
 * per entry: an entry's title, the aliases its body declares, and for a
 * character-anchored entry the bound character's names. Queried with the
 * descriptions `core:query/mention-spans@1` found, so *"the captain"* reaches
 * Captain Vell and *"the order"* reaches The Ashguard Riders.
 *
 * ## A separate space, not a second use of the content vectors
 *
 * Different text at different lengths means different similarity
 * distributions, so a cutoff tuned for two-word names is wrong for
 * two-hundred-word passages. The two want different weights, because *"is
 * called that"* and *"is about that"* are different evidence. And they
 * invalidate independently — renaming re-embeds the names and not the content;
 * rewriting the body re-embeds the content and not the names. Comparing a short
 * string to a short string is also what embeddings are most reliable at, where
 * a two-word mention against a whole-entry vector is a granularity mismatch.
 *
 * ## ⚠ It may only reorder. It may never admit.
 *
 * The pool is the `candidates` in-port, and this returns that same list with a
 * signal attached to whatever linked. There is no id it can emit that some
 * other mechanism did not already produce, and that is a wiring guarantee
 * rather than a promise in a comment.
 *
 * It matters because invented proper nouns are where embeddings are least
 * reliable: "Vell" has no learned meaning, so its vector is assembled from
 * subword fragments and Vell, Vall and Vela cluster. A confident wrong link is
 * worse than a miss — it would inject wrong lore at high confidence into a
 * fixed budget, displacing right lore. Constrained to reordering, the same
 * wrong link costs a position and a line in the receipt naming it.
 *
 * So: exact and trigram matching own invented names; entity vectors own
 * descriptive references.
 *
 * ## No threshold, anywhere
 *
 * Links rank, they do not gate. What bounds this is a **count**, over links
 * ordered by match quality — never a similarity cutoff, because *"is 0.62 a
 * match"* has no answer that survives changing the encoder, and a number that
 * needs per-corpus calibration is a number nobody can set.
 */
export declare const entityLink: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    /** Each link as text — *matched "the captain" → Captain Vell*. */
    links: string;
}, {
    scope: string;
    /**
     * ⚠ **The pool, and the reason this mechanism cannot admit.** It
     * scores what arrives here and returns it; an entry no other
     * mechanism produced is not in this list and therefore cannot
     * be in the output.
     */
    candidates: string;
    /** The descriptions, from `core:query/mention-spans@1`. */
    mentions: string;
    /** Their embeddings, in the same order. Index alignment is the contract. */
    vectors: string;
}, "core:query/entity-link@1"> & {
    kind: 'query';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * A **ceiling, not the mechanism's switch** — see
                 * `mention-spans.maxMentions`, which is. Non-zero so that
                 * turning the mechanism on with one control does something.
                 */
                readonly maxLinks: {
                    readonly type: "integer";
                    readonly default: 5;
                    readonly min: 0;
                    readonly i18n: {
                        readonly en: "Most entries linked";
                    };
                    readonly description: "A ceiling on how many entries one turn may have matched to a description. The best matches are kept; this never brings in an entry nothing else found, it only changes where one comes in the order.";
                };
            };
        };
    } | undefined;
}>;
export declare const personaCard: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    card: string;
}, {
    characterId: string;
}, "core:query/persona-card@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const messageText: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    plain: string;
}, {
    messageId: string;
}, "core:query/message-text@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** Illegal by construction elsewhere; used to prove the purity probe. */
export declare const network: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, import("@serene-pub/sdk").PortDecl, "test:query/network@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const contextBudget: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    available: string;
}, import("@serene-pub/sdk").PortDecl, "core:task/context-budget@1"> & {
    kind: 'task';
    slots?: {
        /**
         * Where the window comes from.
         *
         * The context window belongs to the sampling config, never to a knob
         * on a node (17 §1a) — and the executor resolves a `sampling` slot to
         * the config's switched-on *values*, so this stays a pure Task reading
         * data it was handed rather than a Query looking one up.
         *
         * ⚠ Point this at the same config the generating step uses. A budget
         * computed against one window and a prompt sent against another is
         * wrong in the direction that truncates, silently.
         */
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
        };
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                /**
                 * ⚠ There is no `reserveForReply` here, and there was: an
                 * integer defaulting to 512, sitting beside the sampling
                 * config's own `responseTokens` that also defaults to 512. The same mistake as the ranker's `budget: 4096` —
                 * re-entering a number the system already knows, free to
                 * drift from the model actually being called and warning
                 * nobody when it did. Context in, response out: the reserve
                 * *is* the response allowance, so it is read, not typed.
                 */
                readonly safetyMargin: {
                    readonly type: "number";
                    readonly default: 0.05;
                    readonly description: "Fraction of the window kept free as a buffer against token-count drift.";
                };
            };
        };
    } | undefined;
}>;
/**
 * Fuse two mechanisms that answered the same question into one ordering.
 *
 * Reciprocal-rank fusion, and it is only fusion when the inputs *overlap* —
 * the keyword mechanism and the vector mechanism ranking the same pool, so an entry both
 * found outranks one either found alone. Handed several **disjoint** lists it
 * degrades into concatenation with a fabricated score: every item is unique, so
 * its fused score collapses to its position in its own list, and the
 * `presetScore` stamped on the way out then overrides every signal weight
 * downstream. That is what `core:task/concat-candidates@1` is for, and the
 * binding says so on the receipt when it sees it.
 *
 * ⚠ This declared `strategy` (auto/vector/keyword/hybrid) and `dedup`, and the
 * binding read neither. `strategy` was the 0.5 engine choice, which pipelines
 * replaced with wiring — the mechanisms a run uses are the nodes it has — and `dedup`
 * described what rank fusion does unconditionally, since fusion is keyed by
 * `source:id`. Two controls that rendered, validated and stored a value nothing
 * would ever read; removed rather than wired, because there is no behaviour
 * behind either one to turn on.
 */
export declare const mergeCandidates: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    /** What fused with what — and a complaint when nothing did. */
    diagnostics: string;
}, {
    sources: string;
}, "core:task/merge-candidates@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Put several candidate lists end to end, in the order they were wired.
 *
 * The counterpart to `core:task/merge-candidates@1`, and the distinction is not
 * cosmetic: **concatenation is not fusion**. Lore lanes are disjoint by
 * construction — a world-lore entry is never also a history entry — so there is
 * no agreement between them to measure and nothing to fuse. Passing them
 * through the merge stamped a reciprocal-rank `presetScore` on every candidate,
 * which `select` prefers over the weighted signal sum, so each entry was ranked
 * by its position in its own list and every signal weight was inert.
 *
 * This node deliberately stamps **no score at all**. Ranking is the ranker's
 * job: `core:task/rank-hybrid@1` scores each candidate from its signals against
 * its source's weights, and budgets across sources with the share bands — which
 * is what the bands are for. Order within a source is preserved so a producer's
 * own ordering survives to the tie-break.
 *
 * Repeats are dropped, first occurrence winning, keyed `source:id` the way
 * every other candidate set in the ranker is: the same entry arriving from two
 * lanes should occupy one slot, and the earlier lane is the one the author
 * wired first.
 */
export declare const concatCandidates: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    /** How many arrived per list, and how many repeats were dropped. */
    diagnostics: string;
}, {
    sources: string;
}, "core:task/concat-candidates@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const rankHybrid: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    /**
     * The per-candidate trail: score, included, reason, and the signal
     * breakdown behind it.
     *
     * A declared out-port rather than an implementation detail, because it is
     * what Assemble allocates from — and because a ranker swapped in by a
     * plugin has to produce it too, or the budget panel goes blank the moment
     * anyone changes rankers (16 §5c).
     */
    decisions: string;
    /**
     * What each band was allotted, what it spent, and how many
     * entries it got there (D-H).
     *
     * ⚠ **Published by the binding since it was written, declared
     * by nobody.** `select()` returns this beside the decisions and
     * the binding has always returned it on this key — but an
     * undeclared out-port is invisible: nothing downstream could
     * learn it existed, `validate.ts` skipped the edge, and
     * `core:task/assemble@2` ran its allocation on empty defaults
     * while the numbers sat one node upstream.
     *
     * Spread onto this type alone rather than into `rankPorts` —
     * the same reason the `scripts` hook above is, one construct up
     * (S3). `rank-by-recency` and the `rank-recall` example compute
     * no per-band usage; giving them a port they cannot fill would
     * move two hashes to declare a promise neither keeps.
     *
     * `json` rather than a shape of its own. It is
     * `Record<band, {allocated, used, entries}>` and the band
     * vocabulary is the ranker's `SOURCES` list, which a plugin may
     * extend — a shape id pinned here would freeze the very list
     * that is meant to grow.
     */
    groups: string;
}, {
    candidates: string;
    budget: string;
}, "core:task/rank-hybrid@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: 'parameters';
            readonly facet: 'weights';
            readonly schema: {
                readonly share: {
                    type: 'share';
                    members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    default: {
                        messages: number;
                        worldLore: number;
                        characterLore: number;
                        history: number;
                        relationships: number;
                    };
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
                readonly maxEntries: {
                    type: 'perMember';
                    members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    default: {
                        messages: number;
                        worldLore: number;
                        characterLore: number;
                        history: number;
                        relationships: number;
                    };
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
                readonly minEntries: {
                    type: 'perMember';
                    members: {
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }[];
                    default: {
                        messages: number;
                    };
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
                readonly signalKeyword: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.35;
                        readonly characterLore: 0.35;
                        readonly history: 0.35;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Keyword match';
                    };
                    readonly description: {
                        readonly en: "How much an entry's own trigger keywords appearing in recent messages counts toward its score.";
                    };
                };
                readonly signalNameMatch: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.25;
                        readonly characterLore: 0.25;
                        readonly history: 0;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Name mentioned';
                    };
                    readonly description: {
                        readonly en: "How much a cast member's name appearing in the entry counts when that character is in the scene.";
                    };
                };
                /**
                 * Two questions under one name, split by source — bug 16, and it stays split.
                 *
                 * World lore and history ask *how much of what the scene is naming does this
                 * entry name too*; character lore asks *did this entry's own character speak
                 * in the guaranteed window*. A character-lore entry names its own character
                 * by construction, so the first question scores every present character's
                 * private lore alike and distinguishes nothing.
                 *
                 * ⚠ **The world-lore half is graded now, and this weight moved with it**
                 * (design §13.10, retrieval plan phase 3). It used to be a binary substring
                 * test — does the entry's title or keys contain a cast name, `Al` firing on
                 * `Alchemy` — worth exactly `{0, 0.2}`. It is now the rarity-weighted,
                 * word-boundary, two-sided overlap the admission gate already used: what the
                 * conversation named, intersected with what this entry names, weighted so
                 * that a thing every entry mentions counts for nothing.
                 *
                 * That measure **saturates**: about 0.63 for one rare shared entity and 0.86
                 * for two, so at the old 0.2 its live range would have been ~[0.13, 0.17] —
                 * *narrower* than the crude signal it replaces. Grading without re-weighting
                 * makes a signal more correct and less influential at the same time, so the
                 * weight is sized for the measure that is actually running: 0.35, the same
                 * anchor `entity-search`'s own strength uses, which keeps one strongly
                 * shared name worth a little less than an entry whose every key fired.
                 *
                 * Character lore keeps **0.2**. Its measurement did not change, so its
                 * weight must not either.
                 */
                readonly signalEntityCooccurrence: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.35;
                        readonly characterLore: 0.2;
                        readonly history: 0;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Shared entities';
                    };
                    readonly description: {
                        readonly en: 'How much an entry naming the same people and places as the recent conversation counts. For character lore it asks something else: whether that character has been speaking.';
                    };
                };
                /**
                 * How much *being about the same thing* counts, as an embedding measures it.
                 *
                 * The fourth mechanism and the only one that needs a model. It arrives on
                 * candidates the semantic mechanism found — `core:query/vector-search@1`, wired
                 * into the reply pipeline as a sibling of the lore lanes — and it is a
                 * **score component**, not a rival ordering: an entry both the keyword scan
                 * and the semantic mechanism found keeps its keyword signals and gains this one,
                 * so agreement between two independent mechanisms compounds by addition and
                 * there is no fusion step to reconcile two incomparable scales.
                 *
                 * ⚠ **Not zero, and that is deliberate.** The `admitThreshold` convention
                 * says a control that changes what reaches the model ships off — and it does
                 * here, one level up: the mechanism's own cap (`vector-search.maxEntries`) is 0, so
                 * nothing carries this signal until somebody raises it. Making *both* the cap
                 * and the weight zero would mean raising the cap changed nothing, which is
                 * the trap a two-switch feature always sets. One switch, and it is the one
                 * named after what it does.
                 *
                 * Sized below a keyword hit on purpose. A cosine above the mechanism's own
                 * threshold is real evidence and weaker evidence than an authored key
                 * firing: keys still guarantee, meaning still only adds.
                 */
                readonly signalSemantic: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.3;
                        readonly characterLore: 0.3;
                        readonly history: 0.3;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Similar meaning';
                    };
                    readonly description: {
                        readonly en: 'How much it counts that an entry is about what the conversation is about, even with no shared words. Needs an embedding model and the semantic arm switched on.';
                    };
                };
                /**
                 * How much *being called that* counts, as an embedding measures it.
                 *
                 * The fifth mechanism, and the one that catches the reference nothing else
                 * can. It arrives on candidates `core:query/entity-link@1` matched a
                 * **description** in the conversation to one of an entry's **names** —
                 * *"the captain"* → Captain Vell, *"the order"* → The Ashguard Riders.
                 * Neither reference shares a character with its target, so keywords,
                 * trigrams and the gazetteer all miss them.
                 *
                 * ⚠ **Sized to sit strictly below `signalNameMatch`, and that is a rule.**
                 * Invented proper nouns are where embeddings are least reliable — "Vell"
                 * has no learned meaning, so its vector comes from subword fragments and
                 * Vell, Vall and Vela cluster — so exact and trigram matching own invented
                 * names, entity vectors own descriptive references, and a vector link must
                 * never outrank an entry whose title literally occurred. A similarity
                 * cannot exceed 1, so 0.2 against `signalNameMatch`'s 0.25 keeps that true
                 * at every value the mechanism can produce.
                 *
                 * Not zero, for `signalSemantic`'s reason one field up: the mechanism's switch is
                 * `mention-spans.maxMentions` and it is 0, so nothing carries this signal
                 * until somebody raises it. One switch, not two.
                 */
                readonly signalEntityVector: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.2;
                        readonly characterLore: 0.2;
                        readonly history: 0.2;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Called by a description';
                    };
                    readonly description: {
                        readonly en: 'How much it counts that the conversation described something — "the captain", "the order" — that matches what an entry is called. Needs an embedding model and the description arm switched on. Deliberately weaker than an entry whose name was actually said.';
                    };
                };
                readonly signalTfidf: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0.1;
                        readonly worldLore: 0.1;
                        readonly characterLore: 0.1;
                        readonly history: 0.1;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Distinctive words';
                    };
                    readonly description: {
                        readonly en: 'How much rare, distinctive vocabulary shared with the conversation counts — common words prove little.';
                    };
                };
                readonly signalLastRefRecency: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.1;
                        readonly characterLore: 0.1;
                        readonly history: 0.1;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Recently referenced';
                    };
                    readonly description: {
                        readonly en: 'How much an entry the conversation touched a moment ago outranks one it has not mentioned in a while.';
                    };
                };
                /**
                 * ⚠ **`signalRecency` and `signalSceneAffinity` were declared here and are
                 * gone (migration 0099).** Neither had a producer — anywhere, ever. No
                 * mechanism wrote `signals.recency` and none wrote `signals.sceneAffinity`,
                 * so both weights multiplied a permanent zero: two controls that rendered,
                 * validated, saved, resolved through the whole scope chain, and could not
                 * move a single prompt at any value on any install.
                 *
                 * They are removed rather than wired because each needs a *design decision*
                 * this change is not entitled to make, and both are the kind that is
                 * cheaper to get right later than to guess at now:
                 *
                 *   · **Recency** carried `history: 0.2`, on a band that really is
                 *     populated, so building a producer for it would reorder every install's
                 *     history entries — and the number it would rank on is genuinely
                 *     ambiguous. A dated entry has an *in-world* date and an *authored*
                 *     order, they disagree constantly (a flashback is old and new at once),
                 *     and picking one silently is a worse answer than picking neither.
                 *   · **Scene affinity** has no fact to read. `scenes` and
                 *     `lorebook_bindings.scene_id` exist in the schema, but nothing in
                 *     retrieval knows which scene a session is *in*, so the producer is a
                 *     feature and not a wiring job.
                 *
                 * Both are welcome back the day something produces them — as a new field
                 * beside its producer, which is the order that keeps this from happening a
                 * third time. `runtime/signalWiring.test.ts` is what enforces that: a signal
                 * declared here and producible by nothing fails, and so does the reverse.
                 *
                 * `signalDensity` survives the same audit for the opposite reason — it now
                 * has one. `densitySignal` had existed in `ranking/signals.ts` with no
                 * caller for as long as this weight had existed with no producer; the scan
                 * writes it on every candidate now, exactly as it writes `proximity`.
                 */
                readonly signalDensity: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    /**
                     * ⚠ **Unmoved, and the lore bands' 0 is what makes wiring it safe.**
                     *
                     * `signalProximity`'s case exactly: the number falls out of the key walk
                     * that was already happening, so the only thing this weight decides is
                     * whether it counts — and turning it on reorders lore in an upgraded
                     * install that never asked. Every lore band therefore stays at 0 and the
                     * scan simply starts *reporting* the number, where a reader can see its
                     * value before deciding to weight it.
                     *
                     * `messages: 0.1` is left exactly as it was rather than tidied to 0.
                     * That band is not populated on the shipped path (the entity
                     * mechanism's `messages` out-port is deliberately unwired) and nothing
                     * writes `density` on a message candidate even when it is, so the number
                     * is inert either way — and moving a default that cannot change an
                     * outcome is a re-tune with no reason attached.
                     */
                    readonly default: {
                        readonly messages: 0.1;
                        readonly worldLore: 0;
                        readonly characterLore: 0;
                        readonly history: 0;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Length against the pool';
                    };
                    readonly description: {
                        readonly en: 'How much a longer-than-average entry outranks a short one. Length is a proxy for how much an entry has to say; raise it when your book mixes one-line stubs with real articles.';
                    };
                };
                /**
                 * How tightly an entry's matched keys clustered in the window.
                 *
                 * Two keys matching adjacent is stronger evidence than the same two
                 * matching twenty words apart: "the Ashguard rode" is about the Ashguard
                 * riding, and the same two words either side of a paragraph break are two
                 * unrelated sentences. `signalKeyword` cannot tell those apart — it counts
                 * *how many* of an entry's keys matched and never *where* — so this is the
                 * distinction that signal is missing rather than a second reading of it.
                 *
                 * ⚠ **0 everywhere, which is the one default it can have.** The number is
                 * computed on every scan (it falls out of the key walk that was already
                 * happening), so the only thing this weight decides is whether it counts —
                 * and turning it on reorders lore in an upgraded install that never asked.
                 * Same convention as `admitThreshold` and `scoreLedAllocation`.
                 */
                readonly signalProximity: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0;
                        readonly characterLore: 0;
                        readonly history: 0;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Keywords close together';
                    };
                    readonly description: {
                        readonly en: "How much it counts that an entry's keywords appeared near each other rather than scattered across the window.";
                    };
                };
                readonly signalPriorityBonus: {
                    readonly type: 'perMember';
                    readonly members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly messages: 0;
                        readonly worldLore: 0.15;
                        readonly characterLore: 0.15;
                        readonly history: 0;
                        readonly relationships: 0;
                    };
                    readonly i18n: {
                        readonly en: 'Author priority';
                    };
                    readonly description: {
                        readonly en: "Score added per step of an entry's own priority setting — the author's thumb on the scale.";
                    };
                };
                readonly mechanismWeights: {
                    readonly type: 'strengths';
                    readonly min: 0;
                    readonly max: 1;
                    readonly quick: true;
                    readonly members: readonly [{
                        readonly key: 'keyword';
                        readonly i18n: {
                            readonly en: 'Keywords';
                        };
                        readonly description: {
                            readonly en: "The author's own trigger words, how distinctive the shared vocabulary is, and how closely the matches clustered.";
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'semantic';
                        readonly i18n: {
                            readonly en: 'Meaning';
                        };
                        readonly description: {
                            readonly en: 'Similarity of meaning, with no shared words required. Needs an embedding model and the semantic arm switched on.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'name';
                        readonly i18n: {
                            readonly en: 'Names';
                        };
                        readonly description: {
                            readonly en: 'An entry called by its own name, and entries naming the same people and places as the scene.';
                        };
                        readonly tone: 2;
                    }];
                    readonly default: {
                        readonly keyword: 1;
                        readonly semantic: 1;
                        readonly name: 1;
                    };
                    readonly i18n: {
                        readonly en: 'How entries are found';
                    };
                    readonly description: {
                        readonly en: 'How much each way of finding an entry counts toward its score. Turning one up takes nothing from the others — this is not the context split.';
                    };
                };
                readonly scoreLedAllocation: {
                    readonly type: 'boolean';
                    readonly default: false;
                    readonly i18n: {
                        readonly en: 'Let the best entries lead';
                    };
                    readonly description: {
                        readonly en: 'Spend the whole context on whatever scored highest, wherever it came from, and treat each band as a ceiling rather than a reserved slice. Off divides the context into bands first and fills each one separately, which is how it has always worked.';
                    };
                };
            };
        };
        /**
         * The post-retrieval hook (18 §4a): user chains over the candidate
         * pool before ranking sees it. Spread onto this type alone rather
         * than into `rankSlots` — widening a sibling's accepted set is a
         * hash change on a type nobody meant to touch (S3).
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:candidates/filter@1", "core:script:candidates/rescore@1"];
            readonly port: "candidates";
            readonly phase: "before";
            readonly description: "Scripts that drop or rescore retrieved entries before the ranker orders them. Dropping excludes with a reason; rescoring changes the order.";
        };
    } | undefined;
}>;
export declare const rankByRecency: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    /**
     * The per-candidate trail: score, included, reason, and the signal
     * breakdown behind it.
     *
     * A declared out-port rather than an implementation detail, because it is
     * what Assemble allocates from — and because a ranker swapped in by a
     * plugin has to produce it too, or the budget panel goes blank the moment
     * anyone changes rankers (16 §5c).
     */
    decisions: string;
}, {
    candidates: string;
    budget: string;
}, "core:task/rank-by-recency@1"> & {
    kind: 'task';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                share: {
                    type: 'share';
                    members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    default: {
                        messages: number;
                        worldLore: number;
                        characterLore: number;
                        history: number;
                        relationships: number;
                    };
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
                maxEntries: {
                    type: 'perMember';
                    members: readonly [{
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: 'worldLore';
                        readonly i18n: {
                            readonly en: 'World lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries about the world.';
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: 'characterLore';
                        readonly i18n: {
                            readonly en: 'Character lore';
                        };
                        readonly description: {
                            readonly en: 'Lorebook entries bound to a character.';
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: 'history';
                        readonly i18n: {
                            readonly en: 'History entries';
                        };
                        readonly description: {
                            readonly en: 'Dated entries recording earlier events.';
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: 'relationships';
                        readonly i18n: {
                            readonly en: 'Relationships';
                        };
                        readonly description: {
                            readonly en: 'The narrative graph. Off by default.';
                        };
                        readonly tone: 4;
                    }];
                    default: {
                        messages: number;
                        worldLore: number;
                        characterLore: number;
                        history: number;
                        relationships: number;
                    };
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
                /**
                 * ⚠ Replaced `minMessageTokens: 512`, and the unit is the point.
                 *
                 * "Guaranteed conversation" asked for a token count, which is not
                 * a quantity anybody has an opinion about — 512 tokens is some
                 * number of messages that changes with how long the last few were,
                 * so the same setting produced a different amount of readable chat
                 * every turn. What a user means is *keep the last six messages*.
                 *
                 * Floors lose to the window. `select` fills them in score order and
                 * stops at the budget, because floors summing past the context is
                 * the one way this could build a prompt too big to send.
                 *
                 * ## ⚠ Conversation only, from R6 (retrieval plan §7)
                 *
                 * It used to be a floor **per source**, over the same five bands as
                 * `share` and `maxEntries`. R6 removes every floor except this one:
                 * *"per-source floors are removed everywhere except recent
                 * conversation, which keeps its guaranteed share. Lore competes on
                 * score alone."*
                 *
                 * Two reasons, and the second is the one that could not be worked
                 * around later. A floor is a promise to spend budget on a source
                 * **whether or not it scored**, so a lore floor is a standing
                 * instruction to include lore the ranker did not want — the exact
                 * thing score-led allocation exists to stop. And a floor is a
                 * *second way in*: R1's clairvoyance filter excludes an entry
                 * because the speaker does not know it, and a floor sitting
                 * underneath the ranker could quietly re-admit it. `select` already
                 * takes `ineligible` candidates out ahead of the floors and there
                 * is a test pinning that, but the durable answer is for the floor
                 * not to exist for lore at all.
                 *
                 * The conversation keeps its floor because it is not competing for
                 * relevance in the first place: the last few turns are what makes a
                 * reply a reply, and a window too small to hold them is a broken
                 * prompt rather than a differently-ranked one.
                 */
                minEntries: {
                    type: 'perMember';
                    members: {
                        readonly key: 'messages';
                        readonly i18n: {
                            readonly en: 'Conversation';
                        };
                        readonly description: {
                            readonly en: 'The chat itself — what was actually said.';
                        };
                        readonly tone: 0;
                    }[];
                    default: {
                        messages: number;
                    };
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
            };
        };
    } | undefined;
}>;
/**
 * The two retrieval query windows, as text.
 *
 * A Task because *how a message is written when it is a query* is a decision —
 * speaker attribution in brackets, emphasis stripped — and a different
 * embedding model might want a different shape. It is also where the two
 * windows are cut, which is the parameter a user with long posts will reach for
 * first.
 */
export declare const queryWindows: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    current: string;
    recent: string;
}, {
    messages: string;
    cast: string;
}, "core:task/query-windows@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                readonly currentWindow: {
                    readonly type: "integer";
                    readonly default: 2;
                    readonly description: "How many of the latest messages form the 'current' retrieval query.";
                };
                readonly recentWindow: {
                    readonly type: "integer";
                    readonly default: 3;
                    readonly description: "How many messages before those form the wider 'recent' retrieval query.";
                };
            };
        };
    } | undefined;
}>;
/**
 * The semantic mechanism's ranking, as a Task.
 *
 * Nine stages the legacy engine runs inline: fuse the per-query lists, normalise
 * to the top, boost recency and author priority, cut on an adaptive threshold,
 * diversify with MMR, and cap each source. Every constant behind them is a
 * parameter here — one of them carries a `TODO: make configurable` in the
 * original.
 *
 * A Task rather than part of the vector Query because **it is policy**: which of
 * these stages run, and how hard, is exactly what an installation should be able
 * to replace. The Query retrieves and computes similarity; this decides.
 *
 * `similarity` is a port because MMR needs to compare candidates to each other
 * and a Task cannot ask the host for anything (F11). It is a matrix of cosines,
 * not the embeddings — derived, bounded, and not reversible into the vectors.
 */
export declare const rankSemantic: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    diagnostics: string;
}, {
    /**
     * One entry per query window, each carrying its own per-message
     * ranked lists and its own similarity matrix. The whole stack
     * runs per window; the results are concatenated, not fused.
     */
    windows: string;
    messages: string;
}, "core:task/rank-semantic@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                readonly currentWindow: {
                    readonly type: "integer";
                    readonly default: 2;
                    readonly description: "How many of the latest messages form the 'current' retrieval query.";
                };
                readonly recentWindow: {
                    readonly type: "integer";
                    readonly default: 3;
                    readonly description: "How many messages before those form the wider 'recent' retrieval query.";
                };
                readonly rrfK: {
                    readonly type: "integer";
                    readonly default: 60;
                    readonly description: "Rank-fusion constant — higher values flatten the difference between ranks.";
                };
                readonly recencyBoost: {
                    readonly type: "number";
                    readonly default: 0.15;
                    readonly description: "Extra score given to recent entries.";
                };
                readonly recencyDecay: {
                    readonly type: "number";
                    readonly default: 0.01;
                    readonly description: "How quickly the recency boost fades per message of age.";
                };
                readonly thresholdMin: {
                    readonly type: "number";
                    readonly default: 0.3;
                    readonly description: "Minimum similarity a match needs to be considered at all.";
                };
                readonly relativeThreshold: {
                    readonly type: "number";
                    readonly default: 0.7;
                    readonly description: "Drop matches scoring below this fraction of the best match.";
                };
                readonly mmrLambda: {
                    readonly type: "number";
                    readonly default: 0.7;
                    readonly description: "Balance between relevance and variety — 1 is pure relevance, 0 maximum variety.";
                };
                /**
                 * ⚠ Not the five `SOURCES` the budget split uses. These are
                 * the semantic mechanism's own record kinds — what a stored vector
                 * *is* — and `historyEntry` vs `history` is a real
                 * difference, not a spelling. Mapping one vocabulary onto
                 * the other here would quietly rename keys the ranker
                 * matches literally (`weights.ts DEFAULT_SEMANTIC`).
                 */
                readonly sourceBudget: {
                    readonly type: "perMember";
                    readonly members: readonly [{
                        readonly key: "message";
                        readonly i18n: {
                            readonly en: "Messages";
                        };
                        readonly description: {
                            readonly en: "Chat messages found by meaning.";
                        };
                        readonly tone: 0;
                    }, {
                        readonly key: "worldLore";
                        readonly i18n: {
                            readonly en: "World lore";
                        };
                        readonly description: {
                            readonly en: "Lorebook entries about the world.";
                        };
                        readonly tone: 1;
                    }, {
                        readonly key: "characterLore";
                        readonly i18n: {
                            readonly en: "Character lore";
                        };
                        readonly description: {
                            readonly en: "Lorebook entries bound to a character.";
                        };
                        readonly tone: 2;
                    }, {
                        readonly key: "historyEntry";
                        readonly i18n: {
                            readonly en: "History entries";
                        };
                        readonly description: {
                            readonly en: "Dated entries recording earlier events.";
                        };
                        readonly tone: 3;
                    }, {
                        readonly key: "narrativeRelationship";
                        readonly i18n: {
                            readonly en: "Relationships";
                        };
                        readonly description: {
                            readonly en: "The narrative graph. Off by default.";
                        };
                        readonly tone: 4;
                    }];
                    readonly default: {
                        readonly message: 12;
                        readonly worldLore: 8;
                        readonly characterLore: 6;
                        readonly historyEntry: 6;
                        readonly narrativeRelationship: 5;
                    };
                    readonly i18n: {
                        readonly en: "Most matches per kind";
                    };
                    readonly description: {
                        readonly en: "A ceiling on how many semantic matches of each kind survive fusion, before the budget ranker sees them.";
                    };
                };
                readonly defaultSourceBudget: {
                    readonly type: "integer";
                    readonly default: 20;
                    readonly description: "The ceiling for any match kind not named above — what a plugin-added source gets until it declares its own.";
                };
            };
        };
    } | undefined;
}>;
/**
 * A plugin's ranker — same kind, same shape, so the swap list offers it (16 §5c).
 *
 * Named `rankRecall`, not `rankSemantic`: binding names derive from the id's
 * name segment and ignore the namespace, so this and `core:task/rank-semantic@1`
 * would both want to be `rankSemantic` and generation would emit one export
 * twice. `checkUnique` now catches that; the id changed here because a plugin
 * naming its ranker after its own product is the better name anyway.
 */
export declare const rankRecall: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
    /**
     * The per-candidate trail: score, included, reason, and the signal
     * breakdown behind it.
     *
     * A declared out-port rather than an implementation detail, because it is
     * what Assemble allocates from — and because a ranker swapped in by a
     * plugin has to produce it too, or the budget panel goes blank the moment
     * anyone changes rankers (16 §5c).
     */
    decisions: string;
}, {
    candidates: string;
    budget: string;
}, "chariot.recall:rank-recall@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const renderEntries: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    entries: string;
}, "core:task/render-entries@1"> & {
    kind: 'task';
    slots?: {
        readonly template: {
            readonly kind: "template";
            readonly engine: string;
            readonly facet: "templates";
            readonly variables: {
                readonly entry: {
                    readonly type: "object";
                    readonly fields: {
                        readonly title: {
                            readonly type: "string";
                            readonly description: {
                                readonly en: "The entry's name.";
                            };
                        };
                        readonly content: {
                            readonly type: "string";
                            readonly description: {
                                readonly en: "The text itself.";
                            };
                        };
                        readonly keys: {
                            readonly type: "list";
                            readonly of: {
                                readonly type: "string";
                            };
                            readonly optional: true;
                            readonly description: {
                                readonly en: "The keywords that triggered it.";
                            };
                        };
                    };
                };
            };
            readonly description: "How a retrieved entry is written into the context. Leave empty to use the built-in wording.";
        };
    } | undefined;
}>;
export declare const assemble: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    context: string;
}, {
    candidates: string;
    budget: string;
    templateContext: string;
    /**
     * The ranker's per-candidate trail — score, verdict, reason.
     *
     * ⚠ **Supplied since the node was written, declared only now.**
     * All three shipped specs wire `decisions: $.rank.decisions`,
     * and the binding halts without them ("wire a ranker between
     * retrieval and assembly"), so this is not a new input — it is
     * the load-bearing one. What was missing was the declaration,
     * and the cost of that is exact: `validate.ts` skips its shape
     * check when either side is undeclared (`if (!outShape ||
     * !inShape) continue`), so a plugin ranker publishing the wrong
     * shape on this edge got no finding, and a plugin ASSEMBLER had
     * nothing to read to learn the port existed.
     *
     * `json`, matching `rankPorts.out.decisions` — a decision is a
     * candidate with its arithmetic attached, and the panel reads
     * the same objects the allocator does.
     */
    decisions: string;
    /**
     * The finished chat lines, from `core:task/process-messages@1`.
     *
     * Wired by all three specs (`messages: $.lines.messages`) and
     * undeclared for the same stretch as `decisions`. Two readers
     * depend on it and neither is optional: the transcript the
     * template renders, and the depth the post-history reminder is
     * placed at — which is computed against *these* lines because
     * the context builder ships a placeholder index, the final
     * array not existing when it runs.
     */
    messages: string;
    /**
     * Per band: allocated, used, entries — the arithmetic the
     * ranker did while deciding (D-H).
     *
     * ⚠ **The one genuinely new edge in this set.** The two
     * above were supplied and undeclared; this was PUBLISHED by
     * `core:task/rank-hybrid@1` and wired by nobody, so `allocate`
     * fell to its own `{}` and the per-band numbers the ranker had
     * already computed were dropped on the floor between two
     * adjacent nodes.
     *
     * What it does NOT touch is the prompt: `allocate` puts this
     * straight onto `AllocatedContext.groups` and reads it nowhere
     * else, so `blocks`, `totalTokens` and `budget` — everything
     * the render sees — are byte-identical with it wired or not.
     * What changes is the receipt: `dispatch.ts` publishes
     * `payload.groups` as the run's `sources`, which is the budget
     * panel's whole data set and has been empty on every run.
     *
     * Undeclared on purpose for the other rankers. A ranker that
     * computes no per-band usage leaves this unwired and
     * `allocate` takes the branch it has always taken.
     */
    groups: string;
}, "core:task/assemble@2"> & {
    kind: 'task';
    slots?: {
        readonly template: {
            readonly kind: "template";
            readonly engines: readonly [string, string];
            readonly facet: "templates";
            readonly variables: {
                readonly blocks: "any";
                readonly budget: ["total", "remaining"];
                readonly prompts: ["system", "postHistory"];
            };
            readonly description: "The story string: the overall layout of the finished prompt — where the character cards, lore, history and instructions sit. Leave empty to use the built-in layout.";
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly system: {
                    readonly type: "text";
                };
                readonly postHistory: {
                    readonly type: "text";
                };
            };
        };
        /**
         * How the values Assemble itself produces are laid out.
         *
         * These three exist here rather than upstream because they come out
         * the other side of the budget: what a layout receives is what
         * actually fit, which no earlier node knows.
         *
         * `characterLore` is deliberately absent. It is a top-level value on
         * the assembly context that no template renders — qualifying entries
         * are folded into their bound character inside `characters`, under
         * an `"extra lore"` key. A layout for it would be a setting that
         * changes nothing.
         */
        readonly variables: {
            readonly kind: "variables";
            readonly facet: "variables";
            readonly description: "How the retrieved lore and history are laid out — JSON, prose, or whatever you write. Duplicate one to change it.";
            readonly renders: {
                readonly worldLore: "core:var/world-lore@1";
                readonly history: "core:var/history@1";
                readonly currentDate: "core:var/current-date@1";
            };
        };
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * ⚠ No `budget` here either. It was an integer defaulting to
                 * 4096 — the same re-entered number the ranker carried, with
                 * the same defect: an absolute count on a node cannot know
                 * which model the prompt is about to be sent to, so it was
                 * free to disagree with the window and warn nobody. The
                 * total now arrives on the `budget` in-port from
                 * `core:task/context-budget@1`, which derives it from the
                 * sampling config the reply is generated against.
                 */
                /**
                 * Where the post-history reminder goes, and whether it goes
                 * at all.
                 *
                 * Numbers, so they are parameters rather than prompt text —
                 * a `prompts` slot carries authored strings and typing a
                 * count as one would be the wrong shape wearing a
                 * convenient home. The trigger is a **suppression**: below
                 * it a short chat gets no reminder, because a reinforcement
                 * note two messages after the system prompt is noise.
                 */
                readonly postHistoryDepth: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly description: "Place the post-history reminder this many messages before the end. 0 puts it last.";
                };
                readonly postHistoryTokenTrigger: {
                    readonly type: "integer";
                    readonly default: 0;
                    readonly description: "Only add the reminder once the chat is at least this many tokens long. 0 always adds it.";
                };
                readonly truncation: {
                    readonly type: "enum";
                    readonly of: readonly ["oldest-first", "lowest-weight"];
                    readonly default: "oldest-first";
                    readonly description: "What gets dropped first when the context is over budget.";
                };
                /**
                 * Which sections the prompt is built from, and in what order —
                 * SillyTavern's *prompt list*, as a param on the node that
                 * assembles the prompt (ruling 2026-09-10).
                 *
                 * A param and not a session setting, and not a table: it is the
                 * same kind of fact as "which prompt does this step use", so it
                 * belongs in the configuration a preset selects and it is an
                 * administrator's. A preset carries it to every session started
                 * from it for free, because a preset's configuration is already
                 * what a run resolves against.
                 *
                 * ⚠ **The declared default means "leave the template alone".** It
                 * is the shipped template's own order, so a configuration nobody
                 * has touched stores nothing and renders the bytes it always did —
                 * and a template somebody WROTE, whose sections sit in an order
                 * they chose, is not silently reordered into this one. See
                 * `isShippedPromptBlocks`.
                 */
                readonly blocks: FieldDecl<import("@serene-pub/sdk").FieldType, readonly string[]>;
            };
        };
        /**
         * Which connection this prompt is being written FOR.
         *
         * Not compute, and this node calls nothing: the only thing read out
         * of it is `metadata.promptFormat` — whether the finished prompt is
         * one instruct-wrapped string or a role-tagged array, and which
         * wrapper. A wire format is a property of the endpoint, and until
         * this slot existed there was no way for the node that renders the
         * prompt to learn it. `renderers.ts` fell back to Vicuna on every
         * run, so a ChatML or Llama-2 connection was sent Vicuna markers and
         * nothing anywhere said so.
         *
         * ## Wire it to the SENDING node, always
         *
         * `slot.connectionOf('generate')`, exactly as `contextBudget` shares
         * the sampling reference, and for the same reason stated there: a
         * prompt wrapped for one endpoint and sent to another is wrong
         * silently. Sharing the reference makes the two impossible to point
         * apart rather than documenting that they must agree and hoping.
         *
         * ## No `requires`
         *
         * The sibling connection slots declare one because they are about to
         * CALL the connection and an unmet capability should refuse at bind.
         * This one reads a label. Declaring a capability it never exercises
         * would let an untested connection grey itself out of a picker for a
         * node that was never going to send it anything.
         */
        readonly connection: {
            readonly kind: "connection";
            readonly shape: string;
            readonly description: "Which connection this prompt is formatted for. Point it at the step that sends the reply — a prompt wrapped for one endpoint and sent to another is wrong in a way nothing reports.";
        };
    } | undefined;
}>;
/**
 * Builds the object a context template renders against.
 *
 * A Task, not a Query, even though it reads the cast: what it *is* is the
 * resolution — which characters appear, which get named, which scenario wins —
 * and that is a decision anyone should be able to replace. The read reaches the
 * host like any other (F11 keeps the services out of the Task itself).
 *
 * Separate from Assemble on purpose. Assemble allocates a budget and renders;
 * this decides what there is to render. A plugin that wants different character
 * cards should not have to reimplement token allocation to get them.
 */
export declare const sessionCast: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    cast: string;
}, {
    scope: string;
}, "core:query/session-cast@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** How the speaking character regards everyone else. */
export declare const relationshipsPerspectives: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    relationshipsPerspectives: string;
}, {
    scope: string;
}, "core:query/relationships-perspectives@1"> & {
    kind: 'query';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                maxEntries: {
                    type: 'integer';
                    /**
                     * ⚠ **No `default:`, and its absence is the declaration.**
                     *
                     * Neither spec ever named this slot, so `resolveInput` never
                     * resolved it and `bindings.ts` called `capRelationships` with
                     * `undefined` on every run this node type has ever made — which
                     * that function reads as *no ceiling at all* and returns the
                     * section whole. `respond` wires `params: slot.params()` now, so
                     * whatever is declared here becomes live; under ruling D-8 the
                     * declared default must therefore BE the value every run has
                     * actually used, and that value is "uncapped".
                     *
                     * Uncapped is not expressible as a number here. `0` is already
                     * taken and means the opposite — `capRelationships` returns
                     * `null` for it, so the section is dropped entirely, which is the
                     * `admitThreshold` / `maxEntries` off-switch convention this
                     * package uses everywhere. A negative sentinel IS what
                     * `capRelationships` reads as "no cap" (`cap < 0` returns the
                     * section), but `min: 0` forbids one and no other parameter in
                     * this package uses a negative sentinel; inventing the convention
                     * here would be a design decision riding in on a wiring fix. And
                     * a large finite number is not the value either — it is a
                     * different value that is *usually* indistinguishable, which is
                     * the kind of nearly-right that D-8 exists to refuse.
                     *
                     * So: no default. `resolveSlot`'s params branch copies a schema
                     * default only `if (v?.default !== undefined)`, and
                     * `reconcileConfigs` back-fills a row only when a declaration
                     * carries one — so an untouched install resolves `undefined` and
                     * stays uncapped, exactly as before. The control renders as an
                     * empty box, which `NumberControl` and the panel already treat as
                     * "unset" (an emptied box commits `undefined` and clears the
                     * row), so the empty state round-trips rather than being a hole.
                     *
                     * `drizzle/0111` deletes the stored `12` that `reconcileConfigs`
                     * back-filled from the old declaration; without it, wiring the
                     * slot would cap every upgraded install at 12 as a side effect.
                     */
                    min: number;
                    quick: boolean;
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
            };
        };
    } | undefined;
}>;
/**
 * How everyone else regards the speaking character, and who is known to all.
 *
 * `legendaryFigures` rides here rather than on the other node, and the choice
 * is arguable enough to write down: it is neither the speaker's view nor a view
 * of the speaker, it is what is *publicly known* — which is the same kind of
 * claim as "how others regard you" and the opposite kind from "what you think
 * of them". Splitting it into a third node would put a mostly-empty block in
 * every prompt on every install that has never marked a node legendary.
 */
export declare const relationshipsKnown: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    relationshipsKnown: string;
}, {
    scope: string;
}, "core:query/relationships-known@1"> & {
    kind: 'query';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                maxEntries: {
                    type: 'integer';
                    /**
                     * ⚠ **No `default:`, and its absence is the declaration.**
                     *
                     * Neither spec ever named this slot, so `resolveInput` never
                     * resolved it and `bindings.ts` called `capRelationships` with
                     * `undefined` on every run this node type has ever made — which
                     * that function reads as *no ceiling at all* and returns the
                     * section whole. `respond` wires `params: slot.params()` now, so
                     * whatever is declared here becomes live; under ruling D-8 the
                     * declared default must therefore BE the value every run has
                     * actually used, and that value is "uncapped".
                     *
                     * Uncapped is not expressible as a number here. `0` is already
                     * taken and means the opposite — `capRelationships` returns
                     * `null` for it, so the section is dropped entirely, which is the
                     * `admitThreshold` / `maxEntries` off-switch convention this
                     * package uses everywhere. A negative sentinel IS what
                     * `capRelationships` reads as "no cap" (`cap < 0` returns the
                     * section), but `min: 0` forbids one and no other parameter in
                     * this package uses a negative sentinel; inventing the convention
                     * here would be a design decision riding in on a wiring fix. And
                     * a large finite number is not the value either — it is a
                     * different value that is *usually* indistinguishable, which is
                     * the kind of nearly-right that D-8 exists to refuse.
                     *
                     * So: no default. `resolveSlot`'s params branch copies a schema
                     * default only `if (v?.default !== undefined)`, and
                     * `reconcileConfigs` back-fills a row only when a declaration
                     * carries one — so an untouched install resolves `undefined` and
                     * stays uncapped, exactly as before. The control renders as an
                     * empty box, which `NumberControl` and the panel already treat as
                     * "unset" (an emptied box commits `undefined` and clears the
                     * row), so the empty state round-trips rather than being a hole.
                     *
                     * `drizzle/0111` deletes the stored `12` that `reconcileConfigs`
                     * back-filled from the old declaration; without it, wiring the
                     * slot would cap every upgraded install at 12 as a side effect.
                     */
                    min: number;
                    quick: boolean;
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
            };
        };
    } | undefined;
}>;
/**
 * The narrative graph as a retrieval **mechanism** (ruling 2026-09-10, Q1).
 *
 * ⚠ The ruling calls this an *arm*, and the id deliberately does not. Two
 * reasons, and the second is the stronger: NOMENCLATURE §22 retires *arm* in
 * favour of **mechanism**, and every sibling in this package is named for what
 * it retrieves rather than for the machinery — `entity-search`,
 * `vector-search`, `world-lore`. The word survives in the *descriptions* on
 * those siblings, which is prose a user reads (§23.6); an id is a frozen
 * contract, which is the one place a retired word should not land.
 *
 * The two nodes above are a *dump*: they hand the whole graph section to the
 * template, in whatever order the database returned the rows, and the only
 * control over it is a ceiling. Every other source the prompt is built from is
 * shared, ranked and allocated — which is what makes "world lore matters more
 * than history in this chat" sayable, and what makes "why is this entry here"
 * answerable. Relationships were the one source none of that reached.
 *
 * This is the same three sections read as **candidates**, one per relationship,
 * in the `relationships` band the ranker and the budget have carried since they
 * were written. What it buys is the whole retrieval surface at once: the band's
 * share divides the window, `select` decides what fits, and every relationship
 * arrives on the receipt with a reason.
 *
 * ## Ranked here, not by a second ranker
 *
 * `core:task/rank-hybrid@1` takes this like any other candidate source — the
 * band exists, the share exists, the entry cap exists — so there is no new rank
 * node and no new signal weight. What this node contributes is the **order**,
 * as a `presetScore` the ranker uses directly: scene presence first, then
 * whether the speaker is party to the tie, then how recently it changed. The
 * arithmetic is deterministic and the receipt states each term, which is the
 * standard `presetScore` carries — `core:query/entity-search@1` ranks its own
 * hits the same way for the same reason.
 *
 * ⚠ **It does not duplicate the two nodes above.** All three reach
 * `core:task/build-template-context@1`, on the same two in-ports and never
 * twice: this band is what those sections are built from on a run that
 * allocated any of it, and the two nodes' own dump is what they are built from
 * on a run that did not — which is every run until somebody raises the
 * relationships share. See docs/embeddings-and-rag.md.
 *
 * `relationshipSlots` rather than a declaration of its own, so the ceiling here
 * means exactly what it means on the two nodes above: on/off plus a ceiling,
 * with an absent value uncapped and 0 leaving it out altogether.
 */
export declare const relationshipSearch: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    hits: string;
    /**
     * How many ties were walked, how many the scene was present
     * for, and what the ceiling did — the mechanism-level half of
     * the trail, which no per-candidate row can carry.
     *
     * Declared rather than merely published, unlike the lore lanes'
     * own diagnostics: an undeclared out-port is invisible to
     * `validate.ts` and unreadable by a plugin, which is the finding
     * `core:task/rank-hybrid@1`'s `groups` cost a release.
     */
    diagnostics: string;
}, {
    scope: string;
}, "core:query/relationship-search@1"> & {
    kind: 'query';
    slots?: {
        params: {
            kind: 'parameters';
            facet: 'weights';
            schema: {
                maxEntries: {
                    type: 'integer';
                    /**
                     * ⚠ **No `default:`, and its absence is the declaration.**
                     *
                     * Neither spec ever named this slot, so `resolveInput` never
                     * resolved it and `bindings.ts` called `capRelationships` with
                     * `undefined` on every run this node type has ever made — which
                     * that function reads as *no ceiling at all* and returns the
                     * section whole. `respond` wires `params: slot.params()` now, so
                     * whatever is declared here becomes live; under ruling D-8 the
                     * declared default must therefore BE the value every run has
                     * actually used, and that value is "uncapped".
                     *
                     * Uncapped is not expressible as a number here. `0` is already
                     * taken and means the opposite — `capRelationships` returns
                     * `null` for it, so the section is dropped entirely, which is the
                     * `admitThreshold` / `maxEntries` off-switch convention this
                     * package uses everywhere. A negative sentinel IS what
                     * `capRelationships` reads as "no cap" (`cap < 0` returns the
                     * section), but `min: 0` forbids one and no other parameter in
                     * this package uses a negative sentinel; inventing the convention
                     * here would be a design decision riding in on a wiring fix. And
                     * a large finite number is not the value either — it is a
                     * different value that is *usually* indistinguishable, which is
                     * the kind of nearly-right that D-8 exists to refuse.
                     *
                     * So: no default. `resolveSlot`'s params branch copies a schema
                     * default only `if (v?.default !== undefined)`, and
                     * `reconcileConfigs` back-fills a row only when a declaration
                     * carries one — so an untouched install resolves `undefined` and
                     * stays uncapped, exactly as before. The control renders as an
                     * empty box, which `NumberControl` and the panel already treat as
                     * "unset" (an emptied box commits `undefined` and clears the
                     * row), so the empty state round-trips rather than being a hole.
                     *
                     * `drizzle/0111` deletes the stored `12` that `reconcileConfigs`
                     * back-filled from the old declaration; without it, wiring the
                     * slot would cap every upgraded install at 12 as a side effect.
                     */
                    min: number;
                    quick: boolean;
                    i18n: {
                        en: string;
                    };
                    description: {
                        en: string;
                    };
                };
            };
        };
    } | undefined;
}>;
/**
 * The reply pipeline's context builder.
 *
 * ## Why the narrator has its own type
 *
 * Through 0.6.0 both pipelines pinned this one, and the panel is generated from
 * the registry row — so each advertised the other's controls. Reply prompts all
 * carried an empty `narratorName` box, and the narrator offered layout pickers
 * for `exampleDialogue` (which comes from the speaking character it does not
 * have) and the two relationship variables (which its spec deliberately never supplies).
 * Three controls wired to nothing, in both directions.
 *
 * A type is the unit that declares a configurable surface — it is how a plugin
 * declares one, and `RegistryEntry.slots` carries the declaration precisely so
 * core can render a form without executing the plugin that owns it (12 §2, F6).
 * Narrowing per-spec instead would have meant the row said one thing and the
 * running pipeline another, which is the defect widening that column fixed.
 *
 * The two share `contextPorts` and `sharedRenders` rather than restating them,
 * so the halves that must not drift cannot.
 */
export declare const buildTemplateContext: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    readonly main: string;
    readonly templateContext: string;
    /**
     * The name on the trailing assistant line.
     *
     * Its own port rather than a field inside the context, because
     * nothing renders `{{seedName}}` — it is not a template variable.
     * It is what the message processor writes on the line the model
     * continues from, and in narrator mode it is the one name that
     * must *not* be the joined cast list: seeding "Alice and Cara:"
     * teaches the model to write joint dialogue instead of narrating.
     */
    readonly seedName: string;
}, {
    cast: string;
    currentCharacterId: string;
    /**
     * The narrative graph, as the two claims it really is — how the
     * speaker regards everyone, and how everyone regards the
     * speaker (D-I).
     *
     * ⚠ **Supplied by `respond` since the split, declared here
     * only now.** The spec wires both off
     * `core:query/relationships-perspectives@1` and
     * `core:query/relationships-known@1`, the two `renders` above
     * name the variables they feed, and the builder reads both by
     * these exact names — so every part of the round trip was
     * written down except the ports themselves.
     *
     * `json`, matching what those queries publish and for the
     * reason stated at them: the structure travels so a variable
     * layout can render it, rather than a blob nothing can
     * restyle.
     *
     * ⚠ Declared on THIS type alone rather than in `contextPorts`,
     * which the narrator builder shares. Its own docblock says the
     * narrate spec never supplies these because graph context
     * needs a speaker's perspective and a narrator has none — so
     * widening the shared map would give it two ports it must
     * leave empty forever, and move its hash to say so (S3).
     */
    relationshipsPerspectives: string;
    relationshipsKnown: string;
    /**
     * Who is speaking, when the speaker is not in the cast.
     *
     * ⚠ **Neither is wired by any spec, and both are supplied on
     * every side-character turn.** `core:task/build-side-character-
     * context@1` is not a separate implementation — the host's
     * binding for it unwraps its `speaker` in-port and calls THIS
     * type's handler with the name and the card spread onto the
     * input, because `resolveContextInput` owns the card rules and
     * a side character's card and a cast member's must compile
     * through one function.
     *
     * So the supplier is the host rather than a document, and that
     * is exactly why declaring them matters: it is the only record
     * that this type's input surface is wider than its edges. An
     * undeclared key reaching a handler is indistinguishable from a
     * typo until someone reads both files at once.
     *
     * `speakerName` is `text` — it is the name on the seed line and
     * what `{{char}}` renders. `speakerCharacter` is `json`: the
     * card, or `null` for a free-form name, which is a normal turn
     * rather than a degraded one.
     */
    speakerName: string;
    speakerCharacter: string;
    /**
     * The session's resolved stats and states, as
     * `core:query/session-state@1` publishes them:
     * `{ world, cast, possessions }`, already resolved down the
     * session → lorebook → card → default chain.
     *
     * A template reads `state.world.weather` and
     * `state.cast.verity.hp` — the **resolved** value and nothing
     * below it. Which layer a number came from is a question for
     * the Cast member page, not for a prompt.
     *
     * ⚠ Declared on THIS type alone rather than in `contextPorts`,
     * following `relationshipsPerspectives` above and for the same
     * reason: widening the shared map moves the narrator's hash to
     * declare a port no shipped spec fills. Unwired — which is
     * every shipped spec today — the key is absent and the context
     * has no `state`, which is what a chat session should have.
     */
    state: string;
}, "core:task/build-template-context@1"> & {
    kind: 'task';
    slots?: {
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly description: "The written instructions this pipeline sends the model — pick a prompt, or duplicate one and make it yours.";
            readonly fields: {
                readonly systemPrompt: {
                    readonly type: "text";
                };
                readonly postHistoryInstructions: {
                    readonly type: "text";
                };
            };
        };
        readonly variables: {
            readonly kind: "variables";
            readonly facet: "variables";
            readonly description: "How each part of the prompt is laid out — JSON, prose, or whatever you write. Duplicate one to change it.";
            readonly renders: {
                readonly instructions: 'core:var/instructions@1';
                readonly characters: 'core:var/characters@1';
                readonly personas: 'core:var/personas@1';
                readonly scenario: 'core:var/scenario@1';
                readonly postHistoryInstructions: 'core:var/post-history-instructions@1';
                readonly characterNames: 'core:var/character-names@1';
                readonly personaNames: 'core:var/persona-names@1';
                /** From the speaking character's card. */
                readonly exampleDialogue: "core:var/example-dialogue@1";
                /**
                 * The narrative graph, as two variables rather than one.
                 *
                 * They were `speakerRelationships` — a single block holding
                 * both what the speaker thinks of everyone and what everyone
                 * thinks of the speaker. Opposite claims under one heading,
                 * which a model reads as one list, and one layout, one
                 * priority and one on/off switch for both.
                 */
                readonly relationshipsPerspectives: "core:var/relationships-perspectives@1";
                readonly relationshipsKnown: "core:var/relationships-known@1";
            };
        };
        /**
         * The pre-assemble context hook (18 §4a): user chains over the
         * finished template context — conditional style guides, seeded
         * event tables — after this node resolves it and before anything
         * renders it.
         *
         * `messages/inject` lives here too — **not** on the message
         * processor — because of the ruling of 2026-08-23: injections are
         * template-context *data* (`context.injections`, resolved to
         * `injectionsByIndex` beside `postHistory.targetIndex`), rendered
         * by the template's own message loop. Splicing them into the list
         * behind the template's back would be the §20 defect again, one
         * layer down: a position the template cannot express, an author
         * cannot see, and a corpus cannot check.
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:context/transform@1", "core:script:messages/inject@1"];
            readonly port: "main";
            readonly phase: "after";
            readonly description: "Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.";
        };
    } | undefined;
}>;
/**
 * The narrator pipeline's context builder.
 *
 * Same implementation, same ports, different surface — see
 * `buildTemplateContext` for why that makes it a different type.
 *
 * What it drops: `exampleDialogue`, which `characterExampleDialogue` reads off
 * the speaking character and so is always empty here, and both relationship
 * variables, which the narrate spec never supplies because graph context needs
 * a speaker's perspective and a narrator has none.
 *
 * What it adds: `narratorName`. Load-bearing rather than cosmetic — it is the
 * name on the seed line the model continues from, and `{{narratorName}}` in the
 * narrator's own prompt text.
 *
 * No `declaresRandomness`: the only random choice this node ever made was which
 * example dialogue to use, and it has none to choose from.
 */
export declare const buildNarratorContext: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    readonly main: string;
    readonly templateContext: string;
    /**
     * The name on the trailing assistant line.
     *
     * Its own port rather than a field inside the context, because
     * nothing renders `{{seedName}}` — it is not a template variable.
     * It is what the message processor writes on the line the model
     * continues from, and in narrator mode it is the one name that
     * must *not* be the joined cast list: seeding "Alice and Cara:"
     * teaches the model to write joint dialogue instead of narrating.
     */
    readonly seedName: string;
}, {
    readonly cast: string;
    /**
     * Whose voice the reply is, when a next-speaker node decided (19 §5).
     * Optional: unwired, the speaker still rides the cast bundle (the
     * scope's value), which is how every spec worked before the node
     * existed — and how the narrator's context, which has no speaker,
     * still works. Wired, it wins, so the receipt's speaker and the
     * prompt's speaker cannot disagree.
     */
    readonly currentCharacterId: string;
}, "core:task/build-narrator-context@1"> & {
    kind: 'task';
    slots?: {
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly description: "The written instructions this pipeline sends the model — pick a prompt, or duplicate one and make it yours.";
            readonly fields: {
                readonly systemPrompt: {
                    readonly type: "text";
                };
                readonly postHistoryInstructions: {
                    readonly type: "text";
                };
                readonly narratorName: {
                    readonly type: "text";
                };
            };
        };
        readonly variables: {
            readonly kind: "variables";
            readonly facet: "variables";
            readonly description: "How each part of the prompt is laid out — JSON, prose, or whatever you write. Duplicate one to change it.";
            readonly renders: {
                readonly instructions: 'core:var/instructions@1';
                readonly characters: 'core:var/characters@1';
                readonly personas: 'core:var/personas@1';
                readonly scenario: 'core:var/scenario@1';
                readonly postHistoryInstructions: 'core:var/post-history-instructions@1';
                readonly characterNames: 'core:var/character-names@1';
                readonly personaNames: 'core:var/persona-names@1';
            };
        };
        /** The same hook as `build-template-context` — see it for the terms. */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:context/transform@1", "core:script:messages/inject@1"];
            readonly port: "main";
            readonly phase: "after";
            readonly description: "Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.";
        };
    } | undefined;
}>;
/**
 * The side-character pipeline's context builder (ruling 2026-09-07).
 *
 * Same implementation and the same ports as the other two, plus one in-port —
 * `speaker` — and that port is the whole reason it is a third type rather than
 * a flag.
 *
 * ## Why the name is a port and not a prompt field
 *
 * `build-narrator-context@1` takes `narratorName` in its **prompts** slot,
 * which is correct there: the narrator's name is a setting, chosen once, the
 * same on every turn. A side character's name is *data from the trigger* — it
 * differs per turn and a person may type it in the modal — so putting it in a
 * prompts slot would mean editing a prompt config to speak as somebody else,
 * and every turn would render with whichever name was stored last.
 *
 * ## What it drops, and what it keeps
 *
 * Drops `exampleDialogue`, for the narrator's reason: it is read off the
 * speaking *cast member*, and a side character is not one. Drops both
 * relationship variables, because graph context is built from a cast member's
 * node and this speaker has none. Keeps every shared render, so the cards, the
 * scenario and the two name lists are laid out exactly as they are elsewhere.
 *
 * ⚠ It declares **no** `narratorName` prompt field. A side-character prompt
 * that wrote `{{narratorName}}` would render the narrator's configured name
 * into a turn the narrator is not speaking — the same "control wired to
 * nothing, in both directions" the two context builders were split to end.
 * `{{char}}` is the speaker here, exactly as it is in a reply.
 *
 * ⚠ And it does **not** inherit `contextPorts.in.currentCharacterId`, which the
 * other two carry. Not an oversight: character-lore visibility is decided by
 * the host read, which keys on the run's SCOPE, so a speaker id arriving here
 * could change whose voice the prompt is written in without changing whose lore
 * it was given — a prompt in one person's voice over another's private
 * knowledge. The port would be a control that half-works, which is the exact
 * class this whole split exists to remove. `speaker` carries the name and the
 * card; the id stays where the host can act on it.
 */
export declare const buildSideCharacterContext: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    readonly main: string;
    readonly templateContext: string;
    /**
     * The name on the trailing assistant line.
     *
     * Its own port rather than a field inside the context, because
     * nothing renders `{{seedName}}` — it is not a template variable.
     * It is what the message processor writes on the line the model
     * continues from, and in narrator mode it is the one name that
     * must *not* be the joined cast list: seeding "Alice and Cara:"
     * teaches the model to write joint dialogue instead of narrating.
     */
    readonly seedName: string;
}, {
    cast: string;
    /**
     * `{ name, characterId, known, character }`, from the trigger's
     * first step. `name` is what the seed line carries and what
     * `{{char}}` renders; `character` is the card, absent for a
     * free-form name, which is a normal turn rather than a degraded
     * one — the builder falls back to the name it was given,
     * because a typed name is all there is.
     */
    speaker: string;
    /**
     * Where this turn is happening, as the world state says it.
     *
     * Declared late, and for a defect rather than for symmetry: a
     * voice built with no place in front of it answered from
     * whatever the transcript suggested and moved the scene to a
     * harbour the plan had never mentioned. Unwired on every
     * pipeline that had this node before it, so those keep the
     * context they already had.
     */
    state: string;
    /**
     * The planner's document, for the one fact the state cannot
     * supply on a first turn: where the scene is, before anything
     * has written a location down.
     */
    plan: string;
}, "core:task/build-side-character-context@1"> & {
    kind: 'task';
    slots?: {
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly description: "The written instructions this pipeline sends the model — pick a prompt, or duplicate one and make it yours.";
            readonly fields: {
                readonly systemPrompt: {
                    readonly type: "text";
                };
                readonly postHistoryInstructions: {
                    readonly type: "text";
                };
            };
        };
        readonly variables: {
            readonly kind: "variables";
            readonly facet: "variables";
            readonly description: "How each part of the prompt is laid out — JSON, prose, or whatever you write. Duplicate one to change it.";
            readonly renders: {
                readonly instructions: 'core:var/instructions@1';
                readonly characters: 'core:var/characters@1';
                readonly personas: 'core:var/personas@1';
                readonly scenario: 'core:var/scenario@1';
                readonly postHistoryInstructions: 'core:var/post-history-instructions@1';
                readonly characterNames: 'core:var/character-names@1';
                readonly personaNames: 'core:var/persona-names@1';
            };
        };
        /** The same hook as the other two builders — see them for the terms. */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:context/transform@1", "core:script:messages/inject@1"];
            readonly port: "main";
            readonly phase: "after";
            readonly description: "Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.";
        };
    } | undefined;
}>;
/**
 * The planner's context: the cast, the state, and nothing about a speaker.
 *
 * A planner decides who speaks; it is not itself anybody, so
 * `currentCharacterId` is deliberately absent rather than declared and left
 * empty. What it publishes is what every other builder publishes, so the
 * planner's prompt is assembled by the same node as everyone else's.
 */
export declare const buildPlannerContext: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    readonly main: string;
    readonly templateContext: string;
    /**
     * The name on the trailing assistant line.
     *
     * Its own port rather than a field inside the context, because
     * nothing renders `{{seedName}}` — it is not a template variable.
     * It is what the message processor writes on the line the model
     * continues from, and in narrator mode it is the one name that
     * must *not* be the joined cast list: seeding "Alice and Cara:"
     * teaches the model to write joint dialogue instead of narrating.
     */
    readonly seedName: string;
}, {
    cast: string;
    state: string;
    /**
     * The session's own genre fields, by key — `tone`,
     * `difficulty` and whatever else the genre declared.
     *
     * On the template context under their own names, so an
     * authored prompt writes `{{tone}}` the way it writes
     * `{{char}}`. That is the whole round trip the genre's `fields`
     * declaration promises: declared on the genre, edited in
     * session settings, stored on the row, published by the input
     * node, and read here by the agent whose wording depends on
     * them. Without this port the last step was missing and a
     * prompt naming `{{tone}}` rendered a blank.
     */
    fields: string;
}, "core:task/build-planner-context@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * The narrator's context for a planned turn — the one builder that takes a
 * **plan**.
 *
 * `plan` is the only genuinely new thing in this file's three types: the
 * structured object the planning step produced, put on the template context
 * under `plan` so the narrator's story string can render its beats and its
 * world hints. It is a port rather than a nested literal on `state` because the
 * two are different facts and a template author should be able to tell which is
 * which — `state.world.weather` is what the world IS, `plan.worldHints` is what
 * this turn was asked to make of it.
 *
 * `narratorName` rides the prompts slot, as it does on `build-narrator-context@1`
 * and for the same reason: it is the name on the seed line the model continues
 * from, which is a setting somebody stored rather than data a trigger carried.
 */
export declare const buildSceneContext: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    readonly main: string;
    readonly templateContext: string;
    /**
     * The name on the trailing assistant line.
     *
     * Its own port rather than a field inside the context, because
     * nothing renders `{{seedName}}` — it is not a template variable.
     * It is what the message processor writes on the line the model
     * continues from, and in narrator mode it is the one name that
     * must *not* be the joined cast list: seeding "Alice and Cara:"
     * teaches the model to write joint dialogue instead of narrating.
     */
    readonly seedName: string;
}, {
    cast: string;
    state: string;
    /** What the planning step decided this turn is about. */
    plan: string;
    /**
     * The session's own genre fields, by key — `tone`,
     * `difficulty` and whatever else the genre declared.
     *
     * On the template context under their own names, so an
     * authored prompt writes `{{tone}}` the way it writes
     * `{{char}}`. That is the whole round trip the genre's `fields`
     * declaration promises: declared on the genre, edited in
     * session settings, stored on the row, published by the input
     * node, and read here by the agent whose wording depends on
     * them. Without this port the last step was missing and a
     * prompt naming `{{tone}}` rendered a blank.
     */
    fields: string;
}, "core:task/build-scene-context@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * The state-keeper's context: the state as it stands, so the keeper can report
 * only what the scene changed about it.
 *
 * Its own type rather than the planner's because the two read the same facts
 * for opposite purposes — one is deciding what should happen, the other is
 * writing down what did — and a shared pool would ship them one set of
 * instructions.
 */
export declare const buildKeeperContext: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    readonly main: string;
    readonly templateContext: string;
    /**
     * The name on the trailing assistant line.
     *
     * Its own port rather than a field inside the context, because
     * nothing renders `{{seedName}}` — it is not a template variable.
     * It is what the message processor writes on the line the model
     * continues from, and in narrator mode it is the one name that
     * must *not* be the joined cast list: seeding "Alice and Cara:"
     * teaches the model to write joint dialogue instead of narrating.
     */
    readonly seedName: string;
}, {
    cast: string;
    state: string;
    /**
     * The reply this keeper is reading, as text — put on the
     * template context under `reply`, because the thing a keeper
     * reports on is the scene that was just written and the
     * transcript does not contain it yet.
     */
    reply: string;
    /**
     * ⚠ **An ORDERING edge, and nothing else reads it.**
     *
     * A state change is anchored to the newest message in the
     * session, which is how a swipe takes its changes back with it.
     * So the keeper has to run AFTER the reply is written, not
     * merely beside it — and in a graph whose order is its edges,
     * the only way to say "after that write" is to take the write's
     * result on a port. It is the write result rather than the text
     * for exactly that reason: the text exists before the write and
     * would order nothing.
     *
     * ⚠ Typed `json`, NOT `write-result@1`, and the difference is
     * the standing rule rather than a convenience.
     * `core:shape/write-result@1` is deliberately accepted nowhere:
     * under async review a write is a proposal a reviewer may still
     * reject, so a port declaring that shape is a port promising to
     * handle both arms of it. This node handles neither — it never
     * looks inside — and declaring the shape would claim otherwise.
     * `json` is the honest type for a value taken as opaque, and
     * write results are assignable to it like everything else.
     */
    afterWrite: string;
    /**
     * The session's own genre fields, by key — `tone`,
     * `difficulty` and whatever else the genre declared.
     *
     * On the template context under their own names, so an
     * authored prompt writes `{{tone}}` the way it writes
     * `{{char}}`. That is the whole round trip the genre's `fields`
     * declaration promises: declared on the genre, edited in
     * session settings, stored on the row, published by the input
     * node, and read here by the agent whose wording depends on
     * them. Without this port the last step was missing and a
     * prompt naming `{{tone}}` rendered a blank.
     */
    fields: string;
}, "core:task/build-keeper-context@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Chat rows into the objects a template renders.
 *
 * A Task rather than part of the history Query, because naming a message —
 * which participant said it, under what name at the time — is a *decision*, and
 * decisions are the things a plugin should be able to replace. The Query returns
 * rows; this says who spoke.
 */
export declare const processMessages: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messages: string;
}, {
    messages: string;
    cast: string;
    templateContext: string;
    seedName: string;
    /**
     * Text the model is being asked to CONTINUE — the seed line's
     * body rather than a message of its own (ruling 2026-09-08,
     * D-2).
     *
     * ⚠ **Absent on an ordinary turn, and that is the normal case.**
     * There is no `optional` marker for a port: a port nothing wires
     * resolves to `undefined`, the seed line renders empty, and the
     * model starts the reply. Every spec but a continue leaves it
     * unwired on purpose.
     *
     * It is a port rather than a second synthetic message because a
     * partial reply is not a turn: appending it as one produces two
     * consecutive assistant entries on a chat endpoint and a
     * wrongly-closed block on a completion one. The seed is the one
     * place in the prompt whose block is deliberately left open
     * (`includeClose: false` for id -2), which is exactly what a
     * continuation needs.
     *
     * ⚠ It is **not** a stored message, and nothing downstream may
     * treat it as one. The row holding it is `isGenerating` and is
     * excluded from every message read, so lore scans, semantic and
     * entity queries and history windows do not see it. It counts
     * against the token budget, because it is in the prompt.
     */
    continuationPrefill: string;
}, "core:task/process-messages@1"> & {
    kind: 'task';
    slots?: {
        /**
         * The message-rewrite hook (18 §4a), on the *processed* list —
         * names resolved, per-message interpolation done. `transform` only:
         * `messages/inject` deliberately does **not** live here. Injection
         * is a statement about *position in the rendered conversation*, and
         * position belongs to the template (§20, ruling of 2026-08-23) —
         * inject chains attach on the context builders, land as
         * `context.injections`, and the template's own loop renders them.
         * Splicing rows into this list would be a position the template
         * cannot express and an author cannot see.
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:messages/transform@1"];
            readonly port: "main";
            readonly phase: "after";
            readonly description: "Scripts over the message list the model will see — rewrite or drop lines. Reminders at a depth attach on the context step instead.";
        };
    } | undefined;
}>;
/**
 * The conversation as PROSE, for a step that reads it rather than takes a turn.
 *
 * Two differences from `process-messages@1`, and both are properties of the
 * transcript rather than of the request, which is why they live here and not on
 * the Provider: by the time a prompt is rendered for a completion wire the
 * conversation is one string with an open block at the end of it, and nothing
 * downstream can take either of them back out.
 *
 *   · **No seed.** `process-messages@1` ends its list with an empty assistant
 *     line carrying the next speaker's name, because that line is what tells a
 *     model whose turn it is. A planner and a state keeper are not taking a
 *     turn, and a prompt that ends `Verity:` asks for Verity's next paragraph
 *     however plainly the instructions asked for JSON.
 *   · **No JSON blocks.** A reply that carried a document at the end of it
 *     teaches the next turn's planner its own schema and the keeper somebody
 *     else's. The cut happens on the way into the prompt and never on the
 *     stored row — see `prompt/jsonBlocks.ts`.
 *
 * Everything else is the same naming and the same interpolation, from the same
 * implementation: who spoke, under what name at the time, reaching through
 * participants who have since left.
 */
export declare const proseTranscript: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messages: string;
}, {
    messages: string;
    cast: string;
    templateContext: string;
}, "core:task/prose-transcript@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const turnRoundRobin: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The bare id, for wiring into context and generation. */
    characterId: string;
    /** What decided — the receipt line §5 exists for. */
    strategy: string;
}, {
    cast: string;
    messages: string;
    /** The explicit pick, when the trigger made one. Always wins. */
    characterId: string;
}, "core:task/turn-round-robin@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const turnRandom: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The bare id, for wiring into context and generation. */
    characterId: string;
    /** What decided — the receipt line §5 exists for. */
    strategy: string;
}, {
    cast: string;
    messages: string;
    /** The explicit pick, when the trigger made one. Always wins. */
    characterId: string;
}, "core:task/turn-random@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const turnManual: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The bare id, for wiring into context and generation. */
    characterId: string;
    /** What decided — the receipt line §5 exists for. */
    strategy: string;
}, {
    cast: string;
    messages: string;
    /** The explicit pick, when the trigger made one. Always wins. */
    characterId: string;
}, "core:task/turn-manual@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const turnNone: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The bare id, for wiring into context and generation. */
    characterId: string;
    /** What decided — the receipt line §5 exists for. */
    strategy: string;
}, {
    cast: string;
    messages: string;
    /** The explicit pick, when the trigger made one. Always wins. */
    characterId: string;
}, "core:task/turn-none@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** Turns provider output back into candidate blocks — the map/reduce join. */
export declare const toCandidates: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    candidates: string;
}, {
    items: string;
}, "core:task/to-candidates@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** An author defaulting review ON for their own consumer — and unable to forbid it (F14). */
export declare const attachImage: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    image: string;
}, "core:consumer/attach-image@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Tool calling's two pure halves (20 §9). A *tool* is any same-shaped
 * provider — a sandboxed plugin hook canonically — and these tasks only
 * decide how the model learns about it and how its answer is read back.
 * Between them sits the ordinary generate step; around them sits the loop
 * block, whose iterations are the receipted agentic turn.
 */
export declare const advertiseTools: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    native: string;
    prompt: string;
}, {
    tools: string;
}, "core:task/advertise-tools@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly style: {
                    readonly type: "enum";
                    readonly of: readonly ["native", "prompt"];
                    readonly default: "prompt";
                    readonly description: "How the model learns its tools: 'native' hands the declarations to the API's own tool-calling; 'prompt' writes them into the context for models without one.";
                };
            };
        };
    } | undefined;
}>;
export declare const parseToolCall: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    call: string;
    text: string;
}, {
    text: string;
    tools: string;
}, "core:task/parse-tool-call@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Which tools this session can call, and how each one is described to a model.
 *
 * A Query rather than a literal on `advertise-tools`, because the answer is
 * not a property of the spec: the core tools are fixed, but an install's
 * extensions are not, and a spec that listed its tools by hand would advertise
 * a tool an uninstalled plugin no longer provides — and refuse, by name, the
 * one that was installed yesterday.
 *
 * Each entry is `{ name, description, parameters }` with `parameters` as JSON
 * Schema, which is the shape `advertise-tools` takes and the shape every
 * native tool API wants. Nothing here executes anything; `run-tool` does that,
 * and refuses any name this list did not carry.
 */
export declare const availableTools: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    tools: string;
}, {
    scope: string;
}, "core:query/available-tools@1"> & {
    kind: 'query';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly include: {
                    readonly type: "string[]";
                    readonly description: "Offer only these tools, by name, in this order. Empty offers every tool the session has.";
                };
                readonly plugins: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Offer tools contributed by the session's enabled extensions, as well as the built-in ones.";
                };
            };
        };
    } | undefined;
}>;
/**
 * Run the tool the model asked for, and hand the answer back as text it can
 * read on the next pass (20 §9).
 *
 * ## Why this is a Provider and not a Task
 *
 * The two halves either side of it are pure and this one cannot be: a tool
 * reads the session, or reaches an extension's sandboxed hook, which may in
 * turn reach the network under its own grants. That is `effects: 'external'`
 * exactly — and it is the kind that is handed `ctx.call`, so the tool's own
 * dispatch stays behind the host seam where every other outward call lives.
 * A Task with database access would be a second, unaudited read path.
 *
 * ## What it refuses, and what it never throws
 *
 * `tools` is the advertisement the model was actually given, so a name that
 * was never offered is refused **by name** rather than resolved: a model
 * inventing a tool must not be able to reach one that exists but was withheld
 * from this step.
 *
 * A tool that fails is a **result, not an exception**. `main` is
 * `{ tool, error }` and `text` renders it, because the model asking for a
 * missing file needs to read "no such file" and try something else — a throw
 * would end the run at the one moment the agent could have recovered. The
 * type's `timeoutMs` is the time-box per call: one node invocation is one
 * tool, so the executor's own timeout already is the tool's.
 *
 * `call` may be null — that is the ordinary last iteration, where the model
 * answered in prose and the loop is about to stop. Nothing runs and `text` is
 * empty.
 */
export declare const runTool: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    answer: string;
}, {
    call: string;
    tools: string;
    text: string;
}, "core:provider/run-tool@1"> & {
    kind: 'provider';
    slots?: Record<string, never> | undefined;
}>;
/**
 * A repeated block's outputs, as one string.
 *
 * The missing half of `map` and `loop`. Both publish a **list** — `values`, one
 * entry per iteration — and everything that writes (a message, a lore entry)
 * takes a scalar, so every spec that repeats anything has needed this and
 * every spec has had to end at the block. Reducing in a Consumer instead would
 * put the join inside the write, where no receipt can show it and no author
 * can change it.
 *
 * `path` is what makes it usable on a block: an iteration's value is that
 * chain's last node's **ports object**, so the interesting text is at
 * `.text` or `.answer` rather than at the top. Empty entries are skipped
 * rather than joined, which is what makes "every iteration's answer, and only
 * the iteration that had one" a wiring rather than a filter node.
 */
export declare const joinText: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
}, {
    items: string;
}, "core:task/join-text@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly path: {
                    readonly type: "string";
                    readonly default: "text";
                    readonly description: "Which key to read off each entry. Empty reads the entry itself, for a list of plain strings.";
                };
                readonly separator: {
                    readonly type: "string";
                    readonly default: "\n\n";
                    readonly description: "What goes between the entries that had something to say.";
                };
            };
        };
    } | undefined;
}>;
/**
 * A model's JSON answer, read back as data.
 *
 * ## Why a Task and not a shape on the Provider
 *
 * `core:provider/generate-text@1` is published and frozen, and it publishes
 * prose. A pipeline that wants structure out of a model therefore needs one
 * more step, and that step is the honest place for every way the reading can
 * fail: a fenced block, a preamble the model could not resist, a reply cut off
 * by the token limit. Put inside the Provider it would be a second job hidden
 * in the node that calls the model; here it is a node on the receipt, with its
 * own timing and its own halt.
 *
 * ## `path` is what makes the result WIREABLE
 *
 * A data reference is `{node, port}` — there is no sub-path — so a downstream
 * `map` cannot iterate `plan.speakers` off a port carrying the whole document.
 * `path` is the answer: the parsed document is always on `json`, and `value`
 * and `items` carry whatever `path` selects, so one node serves both the step
 * that reads the whole plan and the block that iterates one list inside it.
 * `items` is `value` as a list — an absent or single value becomes an empty or
 * one-element list, so a map wired to it never has to defend itself.
 *
 * ## It halts rather than inventing an empty answer
 *
 * A reply this node cannot read is a model that did not do what it was asked,
 * and an empty object published as though it were an answer would travel
 * downstream as "nothing changed" — indistinguishable from a turn where
 * genuinely nothing did. `optional: true` on the node is how a spec says it can
 * live without the structure; the executor then records `recoveredAsEmpty` and
 * a reader can see which one happened.
 */
export declare const parseJson: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The whole parsed document, whatever `path` says. */
    json: string;
    /** The value at `path` — the document itself when `path` is empty. */
    value: string;
    /** That same value as a list, for a `map` to iterate. */
    items: string;
}, {
    text: string;
}, "core:task/parse-json@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly path: {
                    readonly type: "string";
                    readonly quick: true;
                    readonly description: "Which value inside the answer to publish on `value` and `items`, as a dotted path. Empty publishes the whole answer.";
                };
            };
        };
    } | undefined;
}>;
export declare const chunkText: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    items: string;
}, {
    text: string;
}, "core:task/chunk-text@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const roll: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    total: string;
}, {
    notation: string;
}, "chariot.dice-tray:roll@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const gate: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    main: string;
}, "test:task/gate@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const slow: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    main: string;
}, "test:task/slow@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const passthrough: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    main: string;
}, "test:task/passthrough@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const badToggleable: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    main: string;
}, "test:task/bad-toggleable@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const embedText: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    vector: string;
    vectors: string;
}, {
    text: string;
    /** Batched: one call, one vector each, in order. */
    texts: string;
}, "core:provider/embed-text@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->embedding"];
        };
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly enabled: {
                    readonly type: "enum";
                    readonly of: readonly ["auto", "on", "off"];
                    readonly default: "auto";
                };
            };
        };
    } | undefined;
}>;
/**
 * An MCP tool call (14 §2) — the generic Provider for a tool on any MCP
 * connection. The snapshot path (14 §3) projects each advertised tool as its
 * own registry row under the connection's namespace, typed off the tool's
 * declared input schema; this generic type is the escape hatch beneath them —
 * pin it, choose the connection, name the tool in params.
 *
 * `effects: 'external'` unconditionally: MCP annotations (`readOnlyHint` and
 * friends) are advisory by specification and are never trusted for gating
 * (14 §4). The admin's per-tool classification lives on the snapshot rows;
 * this generic type gates always, because through it any tool is reachable.
 *
 * The result carries the request and response verbatim in its output — which
 * is the receipt, which is the pitch (14 §5): no other MCP client can answer
 * "what did this tool actually do, and did I approve it" from a row.
 */
export declare const mcpTool: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    /** The content blocks exactly as the server returned them. */
    content: string;
}, {
    /** Arguments for the tool, merged over any declared in params. */
    args: string;
}, "core:provider/mcp-tool@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            /**
             * ⚠ No `requires`, and that is deliberate rather than an omission.
             *
             * The capability space describes io TRANSFORMS — what a model can
             * be handed and what it gives back. An MCP server is not one: it
             * serves tools, it does not turn text into anything. The nearest
             * id, `text->text`, would be false, and claiming it would make
             * every chat connection in the install look offerable here.
             *
             * So this slot keeps filtering by `shape` alone, which is the
             * right axis for it. `requires` is for slots whose answer is "what
             * must this connection be able to DO".
             */
            readonly description: "Which MCP server this step calls.";
        };
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly tool: {
                    readonly type: "string";
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: "Tool";
                    };
                    readonly description: {
                        readonly en: "The advertised tool name on the connected server.";
                    };
                };
            };
        };
    } | undefined;
}>;
/**
 * An MCP resource read (14 §2) — a Provider, deliberately not a Query. A
 * Query may not reach the network (16 §1), and everything crossing the
 * process boundary must be recorded verbatim so replay never re-infers
 * (F16); a resource is external state that can change between runs, and
 * modelling it as a Query would quietly break both rules.
 */
export declare const mcpResource: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    content: string;
}, {
    /** Overrides the declared URI when wired. */
    uri: string;
}, "core:provider/mcp-resource@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly description: "Which MCP server this step reads from.";
        };
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly uri: {
                    readonly type: "string";
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: "Resource URI";
                    };
                    readonly description: {
                        readonly en: "The advertised resource URI on the connected server.";
                    };
                };
            };
        };
    } | undefined;
}>;
export declare const generateText: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    parts: string;
}, {
    context: string;
    /**
     * Whose reply is being generated — the stop-string exclusion
     * (§27l): the speaking character's own name must not stop
     * their own reply. The host already preferred a payload value
     * over the run scope's; this port is what lets a spec supply
     * one, so the exclusion follows the next-speaker node's output
     * (19 §5) instead of the pre-run guess.
     */
    currentCharacterId: string;
    /**
     * Media travelling with the request — the page a user
     * attached, the frame a vision step is asked about. A list
     * because interleaving is ordered and a single ref could not
     * express "these three, in this order".
     *
     * Optional, and never quietly ignored: the host forwards these
     * references to the dispatch, which resolves each one to bytes
     * (checking it belongs to this run's session or user) and hands
     * them to the adapter in this order. A request whose connection
     * has vision switched off, or whose adapter has no code that
     * sends files, is REFUSED rather than sent without them —
     * dropping a file is indistinguishable from a model ignoring it.
     */
    attachments: string;
}, "core:provider/generate-text@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            /**
             * What the connection must be able to do, as opposed to what it
             * is called. `shape` above still types the SLOT; this types the
             * connection, and it is what the picker filters on and what the
             * bind check refuses by — naming "Chat" rather than an id.
             *
             * Only `requires`, deliberately — still, now that the binding DOES
             * consume `attachments`. It is the Anthropic adapter that sends
             * them today (as base64 content blocks on the last user turn); a
             * connection whose adapter has no such code REFUSES a request
             * carrying files rather than sending it without them, so the
             * `attachments` port is honest without a slot-level requirement.
             *
             * An `optional` vision requirement would meanwhile put a "no
             * vision" caveat on every text connection in the app, on every
             * run — and the port is empty on nearly all of them.
             */
            readonly requires: readonly ["text->text"];
            readonly description: "Which model server this step sends its request to.";
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
            readonly description: "The sampling settings — temperature and friends — used for this request.";
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly description: "The written instructions sent with every request from this step.";
            readonly fields: {
                readonly system: {
                    readonly type: "text";
                };
                readonly postHistory: {
                    readonly type: "text";
                };
            };
        };
        /**
         * ⚠ No `template` slot, and there was one — "how the assembled
         * context is wrapped for this model before sending".
         *
         * Nothing read it and nothing seeded a row, so it rendered as an
         * empty picker beside the settings that do work. Wrapping for the
         * wire is the `wire` slot's job and the connection adapter's; a
         * second, inert way to express it invited the two to disagree.
         */
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                readonly stopSequences: {
                    readonly type: "string[]";
                    readonly description: "Sequences that end the reply the moment the model writes one. One per line.";
                };
                readonly streaming: FieldDecl<import("@serene-pub/sdk").FieldType, readonly string[]>;
            };
        };
    } | undefined;
}>;
/**
 * Generate, with the tools on the wire (20 §9) — the native door.
 *
 * ## Why this is a second type rather than two ports on `generate-text`
 *
 * `core:provider/generate-text@1` is published and frozen: a spec that pinned
 * it must keep meaning what it meant. Adding ports would move its content hash
 * and every install would need a re-projection to keep booting — for a
 * capability most connections do not have. A new pin costs a row and conflicts
 * with nothing.
 *
 * It is otherwise the same node: same shape, same slots, same `context` in and
 * the same `main`/`text`/`parts` out. A spec swaps one for the other and
 * nothing else changes.
 *
 * ## The two doors, and why only one of them parses
 *
 * `advertise-tools` publishes both: `prompt` for models that never heard of
 * tools, `native` for APIs that take a declaration list. Wire `native` here and
 * the adapter puts the tools in the field its service calls them — and reads
 * the answer back out of the structured field, so `toolCall` arrives as data.
 * **There is nothing for `parse-tool-call` to do on this door**: the loop's
 * predicate is this node's own `toolCall`, and `run-tool` takes it directly.
 * Parsing prose the API already parsed would be a second reading of one answer.
 *
 * A connection whose adapter cannot send tools REFUSES a request carrying them
 * rather than sending it without: a model that was never offered a tool and a
 * model that declined one produce the same empty `toolCall`, and dropping the
 * declarations silently is indistinguishable from a model choosing not to call.
 */
export declare const generateWithTools: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    text: string;
    parts: string;
    /**
     * `{ tool, args }` when the model called one, null when it
     * answered — the same shape `parse-tool-call` publishes, so
     * `run-tool` and the loop's predicate take either door without
     * knowing which was used.
     */
    toolCall: string;
}, {
    context: string;
    /** `advertise-tools`' `native` port — the declarations, verbatim. */
    tools: string;
    currentCharacterId: string;
    attachments: string;
}, "core:provider/generate-with-tools@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
            /**
             * Asked rather than required, so this node is bindable to every
             * text connection and the author decides what to do without one
             * — which is the ruling on `optional` (`ctx.can`): the type
             * system makes absence impossible to forget about, and the
             * fallback is the author's to write. A spec that wants the
             * emulated door instead wires `advertise-tools`' `prompt`.
             */
            readonly optional: readonly ["tools"];
            readonly description: "Which model server this step sends its request to.";
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly system: {
                    readonly type: "text";
                };
                readonly postHistory: {
                    readonly type: "text";
                };
            };
        };
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                readonly stopSequences: {
                    readonly type: "string[]";
                    readonly description: "Sequences that end the reply the moment the model writes one. One per line.";
                };
                readonly streaming: FieldDecl<import("@serene-pub/sdk").FieldType, readonly string[]>;
            };
        };
    } | undefined;
}>;
/**
 * Generate, with the ANSWER's shape on the wire — the structured door.
 *
 * ## Why a third generate type rather than a schema port on the other two
 *
 * The same reason `generate-with-tools` is a second one: `generate-text@1` is
 * published and frozen, and a port added to it moves the content hash every
 * spec in every install pins. But the stronger reason here is that this node
 * does not make the same REQUEST. `generate-text` sends a turn — a speaker, a
 * trailing assistant line the model continues — and this sends an instruction.
 * A parameter cannot express that difference honestly: a node whose prompt is
 * sometimes a turn and sometimes a question is two nodes with a flag between
 * them, and the flag is the thing a reader has to find before the receipt makes
 * sense.
 *
 * So: no `currentCharacterId` and no `attachments`, and neither is an omission.
 * The first is the speaker whose reply is being written, and nobody's reply is
 * being written. The second is files travelling with a turn.
 *
 * ⚠ **The trailing assistant line is the TRANSCRIPT's business, not this
 * node's.** A prompt arrives here already rendered, and on a completion wire the
 * seed is an open block inside one string that nothing can take back out. So the
 * guarantee is made where the line is never written:
 * `core:task/prose-transcript@1`, which is what a spec wires into the assemble
 * step feeding this node.
 *
 * ## It parses, and that is not the Provider doing two jobs
 *
 * `parse-json@1`'s own header says why the reading is a separate Task *there*:
 * `generate-text` publishes prose, so the reading is a second step over
 * somebody else's output, and every way it can fail deserves its own node on
 * the receipt. Here the structure IS the output — a request that named a schema
 * and came back with a document has nothing left to interpret — so publishing
 * prose and asking the next node to recover the document from it would be
 * undoing the work this node exists to do.
 *
 * The failures still show. `json` is null and `parseError` carries the sentence
 * when the answer could not be read, and `structured` says which door the
 * request actually went out through, so "the model ignored the schema" and
 * "this connection takes no schema, so there was none" are told apart by
 * reading rather than by guessing.
 *
 * `parse-json@1` stays declared and unchanged: it is content-addressed, other
 * specs pin it, and a reply from `generate-text` still needs it.
 */
export declare const generateJson: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    /** The parsed document, which is what this node is for. */
    main: string;
    json: string;
    /** The value at `path` — the document itself when `path` is empty. */
    value: string;
    /** That same value as a list, for a `map` to iterate. */
    items: string;
    /** What the model actually wrote, for a reader diagnosing the above. */
    text: string;
}, {
    context: string;
    /**
     * The shape the answer must take, as a JSON Schema document.
     *
     * Optional, and the node is useful without it: an unschema'd
     * request still asks for JSON rather than prose. Supplied, it
     * reaches whichever field the connection's service calls it —
     * Ollama's `format`, OpenAI's `json_schema`, a GBNF grammar on
     * the llama.cpp family — and a connection that takes none
     * ignores it, which is the degradation rule the adapters
     * already follow for `responseFormat`.
     */
    schema: string;
}, "core:provider/generate-json@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
            /**
             * Asked rather than required, which is the `ctx.can` ruling: the
             * node binds to every text connection and the binding decides
             * what to do without them. The ladder is `json_schema` (the
             * shape on the wire, natively or compiled to a grammar), then
             * `json_object` (JSON, shape unsaid), then a sentence in the
             * prompt — and the last rung works everywhere, so an absence
             * costs fidelity rather than the step.
             */
            readonly optional: readonly ["json_schema", "json_object"];
            readonly description: "Which model server this step sends its request to.";
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly description: "The written instructions sent with every request from this step.";
            readonly fields: {
                readonly system: {
                    readonly type: "text";
                };
                readonly postHistory: {
                    readonly type: "text";
                };
            };
        };
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * Which value inside the answer reaches `value` and `items`.
                 *
                 * A data reference is `{node, port}` with no sub-path, so a
                 * downstream `map` cannot iterate `plan.speakers` off a port
                 * carrying the whole document — the same reason `parse-json`
                 * carries this parameter, and the same spelling.
                 *
                 * Several dotted paths separated by commas are read in order
                 * and their lists joined. That is what makes an answer split
                 * into arms wireable at all: a keeper reports
                 * `{values, possessions}` because a schema can only be strict
                 * about a list whose items are all one shape, and the node
                 * that resolves them takes one list.
                 */
                readonly path: {
                    readonly type: "string";
                    readonly quick: true;
                    readonly description: "Which value inside the answer to publish on `value` and `items`, as a dotted path. Several paths, separated by commas, are joined in order. Empty publishes the whole answer.";
                };
                readonly stopSequences: {
                    readonly type: "string[]";
                    readonly description: "Sequences that end the reply the moment the model writes one. One per line.";
                };
                readonly streaming: FieldDecl<import("@serene-pub/sdk").FieldType, readonly string[]>;
            };
        };
    } | undefined;
}>;
export declare const speak: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    audio: string;
}, {
    text: string;
}, "core:provider/speak@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->audio"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly template: {
            readonly kind: "template";
            readonly engine: string;
            readonly facet: "templates";
        };
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                readonly skipCodeBlocks: {
                    readonly type: "boolean";
                    readonly default: true;
                };
            };
        };
    } | undefined;
}>;
/**
 * Render an image.
 *
 * The structural twin of `generate-text` and `speak`, which is the whole point:
 * one node KIND (`provider`), one type per modality, and the type's `shape`
 * naming which one. That shape is what makes an image node offerable only an
 * image connection and an image sampling config — and, just as importantly, what
 * gives whatever is wired downstream a settled answer about what comes out of it.
 * A single "generate anything" provider whose ports changed with its connection
 * would be a node no spec could plan around.
 *
 * ## Nothing here belongs to one backend
 *
 * An A1111-compatible server takes width and height directly and names its
 * schedulers its own way; ComfyUI takes a whole graph; a hosted API ignores seed
 * and steps entirely. None
 * of that appears in this declaration, because a slot only one backend honours is
 * a control that does nothing on the other three. What a backend alone offers
 * lives on its CONNECTION, declared by its adapter as a profile schema; what a
 * person means lives here and in the sampling config, and the adapter translates
 * — reporting whatever it could not carry across rather than dropping it quietly.
 *
 * ## Ports
 *
 * `media` carries references, never bytes (media.ts): the run stores the image
 * and passes its uuid on, so a consumer that attaches it and a consumer that
 * posts it both work from the same stored row rather than from a base64 string
 * travelling through the graph. `image` is the first of them, for the common
 * single-image wiring, and `caption` is the prompt that produced it — which is
 * what a message posting the image usually wants as its text.
 *
 * `init` is declared now rather than added later: img2img changes nothing else
 * about this contract, and retrofitting a port onto a published type costs a
 * version bump for every spec pinning it.
 */
export declare const generateImage: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    media: string;
    image: string;
    caption: string;
}, {
    prompt: string;
    negative: string;
    /** An input image, for backends that report `img2img`. */
    init: string;
}, "core:provider/generate-image@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            /**
             * The declaration that makes a KoboldCPP connection offerable
             * here at all: its TYPE says text, and what it can do says
             * otherwise.
             */
            readonly requires: readonly ["text->image"];
            readonly description: "Which image server this step sends its request to.";
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
            readonly description: "Steps, CFG, size, seed — the settings every image backend shares.";
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly description: "How the incoming text becomes what the image model is asked for.";
            readonly fields: {
                readonly positive: {
                    readonly type: "text";
                };
                readonly negative: {
                    readonly type: "text";
                };
            };
        };
        /**
         * No `facet`, unlike the text nodes' `weights`: the one parameter
         * here decides how the request is SENT, and the weights facet is
         * where a person looks for what the model is asked for.
         *
         * On an image backend `off` is the difference between one request
         * and a render polled for progress and previews, which is the
         * whole of what a background stage saves by turning it off.
         */
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                streaming: FieldDecl<import("@serene-pub/sdk").FieldType, readonly string[]>;
            };
        };
    } | undefined;
}>;
/**
 * A plugin's own image provider, kept as the worked example of one: same shape,
 * same slots, a `params` schema of its own. Nothing in core dispatches it.
 */
export declare const renderImage: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    image: string;
}, {
    context: string;
}, "chariot.comfy:render-image@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->image"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly positive: {
                    readonly type: "text";
                };
                readonly negative: {
                    readonly type: "text";
                };
            };
        };
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                readonly steps: {
                    readonly type: "integer";
                    readonly default: 25;
                };
            };
        };
    } | undefined;
}>;
/** Consumes a stream and may finish before it ends (01 §11). */
export declare const firstJson: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    main: string;
}, "core:task/first-json@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** Same in-port, but no earlyExit declared — used to prove stream-abandoned. */
export declare const sloppyStream: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    main: string;
}, "test:task/sloppy-stream@1"> & {
    kind: 'task';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Create a message.
 *
 * Split from the old `commitMessage`, which decided new-vs-update from whether an id
 * happened to be present (13 §10b). That was an implicit branch, and F25 exists because
 * implicit branches are unreadable: two specs that did different things looked identical,
 * and the receipt could not tell you which had happened. Two ids, two names, no inference.
 *
 * Gate-eligible, so it publishes the discriminated write result rather than raw ids
 * (13 §7j-b). Under async review this is a proposal a reviewer may still reject.
 */
/**
 * The create pipeline's read (24 §12, T8): what the session's cast wants to
 * say first — one entry per character in position order, each carrying the
 * full greeting history (the first text seeds the message, the rest become
 * swipes), interpolated against the session's first persona.
 *
 * A Query, because deciding what a greeting *is* — group-only lists, the
 * interpolation, the fallback line — is exactly the kind of decision a
 * custom genre should be able to replace without reimplementing the write.
 */
export declare const sessionGreetings: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    greetings: string;
}, {
    scope: string;
}, "core:query/session-greetings@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * The create pipeline's write (24 §12, T8): seed the collected greetings as
 * the session's first messages — one assistant message per entry, the full
 * list as its swipe history, redirected to the genre's declared greeting
 * channel when that is not `main`.
 */
export declare const seedGreetings: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messageIds: string;
}, {
    greetings: string;
}, "core:consumer/seed-greetings@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const createMessage: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messageId: string;
}, {
    text: string;
    /**
     * Media to post WITH the message, as references.
     *
     * `attach-image` exists and cannot do this: it needs a messageId
     * from outside the run, because `write-result@1` is not assignable
     * to `row-ids@1` — so a message created by one node could never be
     * attached to by a second. That rule is right (under async review
     * the created row may never exist), which left no way at all to
     * post a generated image as a NEW message.
     *
     * The answer is the same one streaming got: one node with a settled
     * output, not two nodes and a hope. The write that creates the
     * message is the write that attaches its images.
     */
    media: string;
}, "core:consumer/create-message@1"> & {
    kind: 'consumer';
    slots?: {
        /**
         * The write hook (18 §4a): one chain rewrites the final output, the
         * other decides where a streamed reply stops. Stop is a verdict —
         * min-reduction across every attached script, and the connection's
         * own guards join the same union at dispatch (18 §4b), which is why
         * order never needs ruling. `speakerName` and `castNames` are
         * extras: readable, never writable, by construction (18 §6a).
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:text/transform@1", "core:script:text/stop@1"];
            readonly port: "text";
            readonly phase: "before";
            readonly extras: ["speakerName", "castNames"];
            readonly description: "Scripts over the reply as it is saved — clean up the text, or stop a streaming reply early.";
        };
    } | undefined;
}>;
/**
 * Update an existing message — a regenerate, a swipe, an edit.
 *
 * `target` takes `row-ids@1`, which means **a message created earlier in the same run
 * cannot be updated by a second node**, because `write-result@1` is not assignable to it.
 * That is the ruling, not an oversight: under async review the created row may never
 * exist, so a create → update pair in one spec is a dangling write waiting for a rejection.
 *
 * The case people reach for this with — write a placeholder, fill it as tokens arrive — is
 * streaming, and streaming is one node with a settled output (01 §11), not two nodes and a
 * hope. The case this *is* for is the one where the id comes from outside the run: the user
 * clicked a message, so the id is on the Input.
 */
export declare const updateMessage: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messageId: string;
}, {
    target: string;
    text: string;
}, "core:consumer/update-message@1"> & {
    kind: 'consumer';
    slots?: {
        /** The same write hook as `create-message` — see it for the terms. */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:text/transform@1", "core:script:text/stop@1"];
            readonly port: "text";
            readonly phase: "before";
            readonly extras: ["speakerName", "castNames"];
            readonly description: "Scripts over the reply as it is saved — clean up the text, or stop a streaming reply early.";
        };
    } | undefined;
}>;
export declare const attachAudio: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    audio: string;
}, "core:consumer/attach-audio@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const savePluginData: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    value: string;
}, "core:consumer/save-plugin-data@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const emitSocket: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
}, {
    from: string;
}, "core:consumer/emit-socket@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const summarizeRequest: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    scope: string;
    request: string;
}, import("@serene-pub/sdk").PortDecl, "core:input/summarize-request@1"> & {
    kind: 'input';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** The messages a summary is drawn from, already scoped and ordered. */
export declare const summarizeSource: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    messages: string;
}, {
    scope: string;
    request: string;
}, "core:query/summarize-source@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Cut the messages into batches a model can hold.
 *
 * A Task, not a Query: the cut is a *decision* — how many tokens per batch, and
 * therefore how much context each draft is written against — and it is the
 * first parameter a user with long posts reaches for.
 */
export declare const batchMessages: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    batches: string;
}, {
    messages: string;
}, "core:task/batch-messages@1"> & {
    kind: 'task';
    slots?: {
        /**
         * The window the cut is clamped to — the same slot, by reference,
         * that the drafting step generates against.
         *
         * The context window belongs to the sampling config, never to a knob
         * on a node (17 §1a), and the executor resolves a `sampling` slot to
         * the config's switched-on *values* — so this stays a pure Task
         * reading data it was handed rather than a Query looking one up. Same
         * shape and same reason as `core:task/context-budget@1`.
         *
         * ⚠ Wire it as a REFERENCE to the drafting Provider's slot
         * (`slot.samplingOf(...)`), not as a picker of its own. A batch cut
         * against one window and drafted against another is wrong in the
         * direction that overflows, silently — and unlike the assembled
         * context there is no truncation on this path to catch it, because
         * the batch prompt is injected whole.
         */
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
        };
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * The chat half of a batch prompt, and only that half — the
                 * template around it and the room the draft is written back
                 * into are a reserve the binding adds on top, which is why
                 * this can be raised right up to the window minus that
                 * reserve and no further.
                 *
                 * ⚠ Bigger is not better. Long-context models degrade in the
                 * middle, so this is a QUALITY point rather than a fraction
                 * of whatever window happens to be available: nothing scales
                 * it up to fill a large one, and the window is only ever a
                 * ceiling on what an admin asks for.
                 *
                 * 2560 is 0.5's effective batch (`4096 - 1500`) at a round
                 * 2.5 Ki, so arriving here re-tunes nobody.
                 */
                readonly batchTokens: {
                    readonly type: "integer";
                    readonly default: 2560;
                    readonly i18n: {
                        readonly en: "How much chat each batch holds";
                    };
                    readonly description: {
                        readonly en: "Tokens of chat one summary draft is written from. Capped by the drafting step’s Context Tokens, less room for the prompt and the draft itself.";
                    };
                };
                readonly minBatchMessages: {
                    readonly type: "integer";
                    readonly default: 1;
                    readonly description: "Never cut a batch smaller than this many messages.";
                };
            };
        };
    } | undefined;
}>;
/** Phase 1 — one batch, drafted without sight of any other. */
export declare const summarizeBatch: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    draft: string;
}, {
    batch: string;
    request: string;
    /**
     * Which kind of entry this pipeline writes — the word every
     * summarize prompt template branches on (D-I).
     *
     * ## A port, not a parameter, and the call site is what decides
     *
     * `summarizeSpec` writes it as a **literal into the node's
     * config**, in the same map as `batch` and `request` and
     * alongside them: `C.summarizeBatch.v1({ batch, request,
     * loreType, … })`. `resolveInput` passes a non-ref config value
     * through untouched, so the binding reads `input.loreType`
     * exactly the way it reads a port — same position, same access,
     * same absence-is-`undefined`. Declaring it as anything else
     * would describe a mechanism that is not the one running.
     *
     * A `params` field is the alternative, and it is the wrong one
     * twice over. It would move the read to `input.params.loreType`
     * — a different value from a different layer — and it would put
     * the control in the panel, stored per configuration and
     * layered instance → user → session like every other parameter.
     * `SummarizeShape` in the catalog already rules on that: this is
     * "the thing that distinguishes the four namespaces from one
     * another", and a user who changed it "would turn their scene
     * summarizer into a world summarizer without renaming
     * anything".
     *
     * ⚠ An in-port no edge feeds is not a contradiction here. A
     * port is a named input the node reads; where the value comes
     * from — an upstream node, or an author writing it down — is the
     * document's business. What the declaration buys is that the
     * name is now checkable: the app's binding types derive their
     * legal reads from `ports.in`, so `input.loreTypes` stops
     * compiling, and the panel and the plugin validator can both see
     * that this node takes one.
     *
     * `text` rather than an enum shape: a shape ids a payload, and
     * the four legal words are the prompt templates' vocabulary,
     * which a plugin summarizer is free to extend.
     */
    loreType: string;
}, "core:provider/summarize-batch@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly batch: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/** Phase 2 — the ordered drafts merged into one past-tense narrative. */
export declare const summarizeSynth: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    content: string;
}, {
    drafts: string;
    request: string;
    /** Authored on the node, exactly as on the batch step — see it. */
    loreType: string;
}, "core:provider/summarize-synth@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly synth: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/** What the entry gets called. Its own step because it has its own prompt. */
export declare const nameEntry: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    name: string;
}, {
    content: string;
    /** Authored on the node, exactly as on the two steps above — see them. */
    loreType: string;
}, "core:provider/name-entry@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly name: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/**
 * Who was in the scene — scene summaries only.
 *
 * Present on one summarize pipeline and not the other three, which is exactly
 * why they are four specs rather than one spec with a flag. A flag would put the
 * difference in a condition somebody has to find; four specs put it in the shape.
 */
export declare const extractCast: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    cast: string;
}, {
    content: string;
    messages: string;
    request: string;
}, "core:provider/extract-cast@1"> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly characterExtraction: {
                    readonly type: "text";
                };
            };
        };
        /**
         * The two halves of a replaceable core function, on the scripts
         * rung. Scripts here *shape* the extraction — what the model reads,
         * what the pipeline keeps. Replacing the extractor itself is the
         * other rung: a same-shaped provider offered by the swap list,
         * because extraction calls a model and scripts are pure compute.
         */
        readonly scripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:text/transform@1"];
            readonly port: "content";
            readonly phase: "before";
            readonly description: "Scripts over the scene text before the extractor reads it — strip out-of-character chatter, normalise a nickname, redact.";
        };
        readonly castScripts: {
            readonly kind: "scripts";
            readonly accepts: ["core:script:cast/transform@1"];
            readonly port: "cast";
            readonly phase: "after";
            readonly description: "Scripts over the extracted cast — rename someone, merge aliases, drop a junk detection, add someone the model missed.";
        };
    } | undefined;
}>;
/**
 * The keywords an entry is proposed to be found by — **without a model**.
 *
 * ## The defect it exists for
 *
 * The summarizer writes a history entry with `keys: []`. Keyword matching is the
 * only retrieval mechanism on by shipped default, and a history row carries no
 * title for `nameMatch` to read either, so a summary a user made *so the model
 * would remember* cannot be found by anything. Measured on the core corpus:
 * with no keys, **0 of 12** history entries are reachable by any conversation
 * about them.
 *
 * ## ⚠ Why it is not a Provider, and why that is the whole point
 *
 * Every sibling in this section calls a model — `name-entry@1` writes the title,
 * `extract-cast@1` reads the cast. This one is `core:query`, computes from the
 * lorebook it already has, and **cannot invent a keyword**: every key it emits
 * is a substring of the text it was given. A proposal that cannot hallucinate
 * needs no review for hallucination, only for judgement, which is a far cheaper
 * review — and it costs no tokens, no connection and no wait.
 *
 * ## ⚠ The failure mode it is built against
 *
 * **Character names are the worst possible keys for a scene.** They are also
 * what any extractor finds first, and if every scene's entry is keyed on who was
 * in it then every one of them fires whenever that person is mentioned. That
 * replaces *"history entries never fire"* with *"all history entries fire
 * together"*, which is worse — one entry crowding out the rest, across a whole
 * lane, in a fixed budget where a wrong entry displaces a right one.
 *
 * Measured, on ten messages that name two cast members and nothing else:
 * **0 of 12** history entries fire, and **11 of 12** with the guards against it
 * removed. Everything the node does is downstream of that number.
 *
 * ⚠ There are two guards, not one, and the measurement needed both removed. A
 * name in every scene also fails the *statistical* test — it already matches
 * most of the book — so on a lorebook with entries to count over, either one
 * holds the line. On a lorebook with two entries in it, only the structural
 * rule can, and that is the lorebook a user has when they start making
 * summaries.
 *
 * ## What a consumer gets
 *
 * `keys` carries each proposal with its evidence — where in the text it occurs,
 * the sentence around it, how distinctive it is in this lorebook, and how many
 * other entries it already matches — and `rejected` carries every candidate
 * turned away with the rule that turned it away. Both exist because this node
 * **proposes and never writes**: what it emits is meant to reach a person who
 * can edit it before `core:consumer/create-lore-entry@1` stores anything, and a
 * reviewer who has to hunt for the reason will approve without reading.
 *
 * ⚠ It never proposes **secondary** keys. Those carry a user's `selectiveLogic`
 * conditions — *"fire on dragon, but not when statue is present"* — which is an
 * author saying *not here*, and nothing that guesses is entitled to say it.
 */
export declare const entryKeys: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** The proposals, each with the evidence for it. */
    keys: string;
    /** Every candidate turned away, and the rule that turned it away. */
    rejected: string;
}, {
    /** The lorebook and the cast — what distinctiveness is measured against. */
    scope: string;
    /**
     * The passage keys are proposed for.
     *
     * `content`, matching `name-entry@1`, so both proposal steps take
     * the drafted summary off the same out-port under the same name.
     */
    content: string;
}, "core:query/entry-keys@1"> & {
    kind: 'query';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly facet: "weights";
            readonly schema: {
                /**
                 * ⚠ **A ceiling on firing opportunities, not a display
                 * preference.** Any single key matching admits the entry, so
                 * this is how wide the entry's door is — and the keyword
                 * signal is `matched / keys.length`, so a longer list also
                 * makes the entry *rank* worse for the same single hit.
                 *
                 * Five: a scene is about a place, a thing and an event or
                 * two. Measured at eight, with the ordinary-word cap opened
                 * with it, **six of twelve** history entries fire on
                 * narrative prose naming nothing from any scene — against
                 * one at five — and the shared-name probe stops being clean.
                 * **0 is off**, in the `admitThreshold` convention.
                 *
                 * It is a ceiling and never a target — fewer is the normal
                 * result and none is a valid one.
                 */
                readonly maxKeys: {
                    readonly type: "integer";
                    readonly default: 5;
                    readonly min: 0;
                    readonly max: 20;
                    readonly quick: true;
                    readonly i18n: {
                        readonly en: "Most keywords suggested";
                    };
                    readonly description: "A ceiling on how many keywords are proposed for one entry. Each one is another way the entry can be pulled into a prompt, so a short list is usually a better one. 0 suggests none.";
                };
                /**
                 * ⚠ **The one calibration a user can actually reason about**,
                 * and the reason the others are not here. How rare a word has
                 * to be, how short it may be, how much of a name to keep —
                 * those are measurements, not preferences, and a settings
                 * panel cannot perform them.
                 *
                 * This one is a preference, because it trades two things a
                 * user can feel: an ordinary word like "watch" or "left" is
                 * how an entry gets found when it names nothing proper, and
                 * it is also how an entry starts firing on any scene at all.
                 * Two ordinary words of five; 0 restricts suggestions to
                 * names and places, which measured cleanest and left two of
                 * twelve summaries with no keys at all.
                 */
                readonly maxOrdinaryWords: {
                    readonly type: "integer";
                    readonly default: 2;
                    readonly min: 0;
                    readonly max: 20;
                    readonly i18n: {
                        readonly en: "Ordinary words allowed";
                    };
                    readonly description: "How many of the suggestions may be everyday words rather than names of people, places or things. Names are far less likely to pull the entry into an unrelated scene; 0 suggests names only.";
                };
            };
        };
    } | undefined;
}>;
/** Write the finished entry. Gate-eligible, so it publishes a write result. */
export declare const createLoreEntry: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    entryId: string;
}, {
    name: string;
    content: string;
}, "core:consumer/create-lore-entry@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const graphScenes: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    scenes: string;
}, {
    scope: string;
}, "core:query/graph-scenes@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/** Which existing node a mentioned name refers to, or whether it is new. */
export declare const graphNodeResolution: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    result: string;
}, {
    scenes: string;
}, string> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly [x: string]: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/** Drop what is not worth graphing before the expensive steps run. */
export declare const graphPreFilter: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    result: string;
}, {
    scenes: string;
}, string> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly [x: string]: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/** Whose account of the scene this is. */
export declare const graphPerspective: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    result: string;
}, {
    scenes: string;
}, string> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly [x: string]: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/** The two-sentence introduction written for a newly discovered character. */
export declare const graphNodeDescription: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    result: string;
}, {
    scenes: string;
}, string> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly [x: string]: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/** Did any present character reach a new lifecycle state this scene? */
export declare const graphStateDetection: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    result: string;
}, {
    scenes: string;
}, string> & {
    kind: 'provider';
    slots?: {
        readonly connection: {
            readonly kind: "connection";
            readonly quick: true;
            readonly shape: string;
            readonly requires: readonly ["text->text"];
        };
        readonly sampling: {
            readonly kind: "sampling";
            readonly quick: true;
            readonly shape: string;
        };
        readonly prompts: {
            readonly kind: "prompts";
            readonly quick: true;
            readonly facet: "prompts";
            readonly fields: {
                readonly [x: string]: {
                    readonly type: "text";
                };
            };
        };
    } | undefined;
}>;
/**
 * The proposal, held for review.
 *
 * `effects: 'write'` and therefore gate-eligible, which is the mechanism behind
 * the rule that a graph build **stops at the review screen** and never applies
 * itself. Under `async` review the proposal is exactly that — a proposal — and
 * `write-result@1` is the shape that refuses to be mistaken for row ids.
 */
export declare const graphProposal: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    proposalId: string;
}, {
    proposal: string;
}, "core:consumer/graph-proposal@1"> & {
    kind: 'consumer';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * The session's stats, states and possessions, resolved.
 *
 * `{ world, cast, possessions }` — the same object `stateFor(sessionId)`
 * returns and the shape `state` on `core:task/build-template-context@1` takes.
 * Every value is already resolved down session → lorebook → card →
 * declaration default, with absence meaning **inherit** rather than zero, and
 * derived slots computed rather than read.
 *
 * A Query, and a plain one: what it is is a read. There is no as-of parameter
 * — this is the `current` view, and the temporal registry that would give the
 * other one is not built (see docs/stats-and-states.md).
 */
export declare const sessionState: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    state: string;
}, {
    scope: string;
}, "core:query/session-state@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
/**
 * Change state — or ask to.
 *
 * ## Why `propose` is the default
 *
 * The three writers do not have equal authority (`DESIGN-stats-and-states.md`).
 * A person editing a bar is authoritative; a genre's own script rolling damage
 * is authoritative because the genre author wrote the arithmetic; a **model**
 * is neither, and a model that could set a number silently is a model that can
 * rewrite the fiction between two messages with no receipt a player can
 * refuse. Defaulting to `propose` means a spec that wires a model's output
 * straight into this node produces a pending line with Accept / Reject, and a
 * genre that wants the other behaviour says so in one parameter.
 *
 * ## Why it is a Task
 *
 * It writes, which a Task is not otherwise supposed to do, and the alternative
 * is worse: F7 allows a spec **one** write-class Consumer and that one is the
 * message. A damage roll that also saves a reply would be unspecifiable. What
 * makes it defensible rather than a hole is that these rows are not the run's
 * primary artifact — every one of them is anchored to a message and retracted
 * with it, so a rejected turn takes its state changes with it.
 *
 * `changes` is a list of two arms, discriminated by which key is present:
 * `{ owner, slotId, value }` sets an attribute, `{ owner, entryId, delta }`
 * moves possession of a lorebook entry. One port rather than two because one
 * turn's changes are one ordered list, and splitting them would let a spec
 * apply half of them.
 */
/**
 * Changes a model NAMED, turned into changes `set-state` can write.
 *
 * ## A Query, because resolving a name is a READ
 *
 * "Verity" becomes a cast row by looking her up in this session's cast, which
 * is a read of the host and therefore a Query's job — a Task is handed no
 * services (F11). That also buys the scoping refusal for free: the cast it
 * matches against is the cast of the session on the `scope` port and no other.
 *
 * ## Why this is a node and not a leniency inside `set-state`
 *
 * `core:task/set-state@1` takes an owner as `{ kind, id }` — a row, resolved,
 * unambiguous. A model has no row ids: it has the names the transcript gave it
 * ("Verity", "the world") and the local name of a stat ("hp"). Something has to
 * resolve one into the other, and the two candidates were this node or a
 * widened `set-state`.
 *
 * It is this node, because the two callers are genuinely different. A genre's
 * own script that rolled damage knows which cast row it hit and must not have
 * its exact owner re-guessed by a fuzzy name match; a model's proposal has
 * nothing else to offer. Widening `set-state` would make every writer pay for
 * the model's ambiguity, and would move a resolution failure inside the node
 * that writes — where it can only be a refusal, never a line on the receipt.
 *
 * The same resolution the three state tools do (`set_state`, `give_item`,
 * `take_item`), reached from a structured block instead of from a tool call.
 *
 * ## A name it cannot resolve is a RESULT, not a halt
 *
 * A keeper that named five changes and got one character's name wrong should
 * land four proposals and a sentence about the fifth. `refused` carries those
 * sentences so the receipt can show them; `changes` carries what resolved.
 * Halting the turn over one bad name would lose the other four, which is the
 * same argument `set-state`'s own per-change refusal makes.
 */
export declare const resolveStateChanges: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    /** Ready for `core:task/set-state@1`'s `changes` port. */
    changes: string;
    /** One sentence per change that named something not here. */
    refused: string;
}, {
    /**
     * `[{ owner, slot, value } | { owner, entryId, delta }]` as a
     * model writes them: `owner` is a name from the conversation or
     * `world`, `slot` is a stat's local name (`hp`) or its full id.
     */
    changes: string;
    /** Which session's cast the names are resolved against. */
    scope: string;
    /**
     * The planner's document, whose `worldHints` are a second,
     * smaller set of named changes: where this turn happens, the
     * time of day and the weather.
     *
     * Its own port rather than more entries on `changes`, because
     * a reference is `{node, port}` with no sub-path — a spec
     * cannot join one node's list to another node's object on one
     * port, and the two are written by different agents answering
     * different questions. A hint that repeats what the world
     * already says proposes nothing, which is what makes "repeat
     * the state when this turn changes none of it" safe to ask of
     * the planner.
     */
    plan: string;
}, "core:query/resolve-state-changes@1"> & {
    kind: 'query';
    slots?: Record<string, SlotDecl> | undefined;
}>;
export declare const setState: import("@serene-pub/sdk").Pinned<import("@serene-pub/sdk").Descriptor<{
    main: string;
    applied: string;
    proposed: string;
}, {
    changes: string;
    scope: string;
}, "core:task/set-state@1"> & {
    kind: 'task';
    slots?: {
        readonly params: {
            readonly kind: "parameters";
            readonly schema: {
                readonly mode: {
                    readonly type: "enum";
                    readonly of: readonly ["propose", "apply"];
                    readonly default: "propose";
                    readonly quick: true;
                    readonly description: "'propose' holds the changes for the player to accept or reject; 'apply' writes them immediately, stamped with this run. Use 'apply' only where the pipeline itself decided the number.";
                };
            };
        };
    } | undefined;
}>;
//# sourceMappingURL=index.d.ts.map