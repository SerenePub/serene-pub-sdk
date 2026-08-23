/**
 * Sample core contracts — what /contracts would generate.
 *
 * Every entry is a descriptor plus a pinned constructor. Note that the LLM, TTS and
 * image-gen providers are structurally identical: `params` is declared per type, so
 * nothing anywhere switches on modality (17 §1).
 */
import { S } from '@serene-pub/sdk';
import { jinja2, handlebars } from '@serene-pub/sdk';
import { describeInput, describeQueryType, describeTaskType, describeProvider, describeConsumerTarget, pin, } from '@serene-pub/sdk';
// ── Inputs ──────────────────────────────────────────────────────────────────
export const userMessage = pin(describeInput({
    id: 'core:input/user-message@1',
    ports: { out: { main: S.json, text: S.text, chatScope: S.chatScope } },
}));
/**
 * A message that already exists — the trigger carries its id.
 *
 * `messageId` is `row-ids@1` rather than `json` because it *is* a row id, and typing it
 * as one is what makes `updateMessage` wireable at all: the id an update is allowed to
 * take is the id of a row that already exists, which is exactly what an event about an
 * existing message carries (13 §10b).
 */
export const messageCreated = pin(describeInput({
    id: 'core:input/message-created@1',
    ports: { out: { main: S.json, messageId: S.rowIds } },
}));
// ── Queries ─────────────────────────────────────────────────────────────────
export const chatHistory = pin(describeQueryType({
    id: 'core:query/chat-history@1',
    i18n: { name: { en: 'Chat history' } },
    timeoutMs: 2000,
    slots: {
        template: {
            kind: 'template',
            engine: jinja2.id,
            facet: 'templates',
            description: 'How each chat message is written into the context. Leave empty to use the built-in wording.',
        },
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                limit: {
                    type: 'integer',
                    default: 40,
                    description: 'How many recent messages are considered for the context.',
                },
                weight: {
                    type: 'number',
                    default: 0.4,
                    description: 'Priority of chat history against other sources when the context is ranked.',
                },
                minInclude: {
                    type: 'integer',
                    default: 6,
                    description: 'Always keep at least this many of the most recent messages, even when space is tight.',
                },
                priority: {
                    type: 'enum',
                    of: ['low', 'normal', 'high', 'always'],
                    default: 'normal',
                    description: "How strongly history resists being trimmed — 'always' is never dropped.",
                },
            },
        },
    },
    ports: {
        in: { scope: S.chatScope, budget: S.budget },
        out: { main: S.candidates, messages: S.candidates },
    },
}));
export const lorebookTriggers = pin(describeQueryType({
    id: 'core:query/lorebook-triggers@1',
    i18n: { name: { en: 'Lorebook triggers' } },
    timeoutMs: 2000,
    slots: {
        // A *source* template: it renders one entry, so its scope is the item's shape —
        // which is inside the port's payload, not on the port (16 §4 correction).
        template: {
            kind: 'template',
            engine: jinja2.id,
            facet: 'templates',
            variables: { entry: ['title', 'content', 'keys'] },
            description: 'How one triggered lorebook entry is written into the context. Leave empty to use the built-in wording.',
        },
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                scanDepth: {
                    type: 'integer',
                    default: 3,
                    description: 'How many recent messages are scanned for lorebook keywords.',
                },
                caseSensitive: {
                    type: 'boolean',
                    default: false,
                    description: 'Match keywords exactly, respecting upper and lower case.',
                },
                weight: {
                    type: 'number',
                    default: 0.35,
                    description: 'Priority of triggered lore against other sources when the context is ranked.',
                },
                minInclude: {
                    type: 'integer',
                    default: 3,
                    description: 'Always keep at least this many triggered entries when any match.',
                },
                // ST parity items (13 §7i)
                recursionDepth: {
                    type: 'integer',
                    default: 0,
                    description: "Let a triggered entry's own text trigger further entries, this many levels deep. 0 turns recursion off.",
                },
                useRegex: {
                    type: 'boolean',
                    default: false,
                    description: 'Treat entry keys as regular expressions instead of plain keywords.',
                },
            },
        },
    },
    ports: {
        in: { text: S.text, scope: S.chatScope },
        out: { main: S.candidates, hits: S.candidates },
    },
}));
/** Probability rolls come from the run seed, so they replay (13 §7i). */
export const lorebookProbabilistic = pin(describeQueryType({
    id: 'core:query/lorebook-probabilistic@1',
    timeoutMs: 2000,
    declaresRandomness: true,
    ports: {
        in: { text: S.text },
        out: { main: S.candidates, hits: S.candidates },
    },
}));
export const vectorSearch = pin(describeQueryType({
    id: 'core:query/vector-search@1',
    timeoutMs: 3000,
    slots: {
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                topK: {
                    type: 'integer',
                    default: 12,
                    description: 'How many of the closest matches each retrieval query returns.',
                },
                minScore: {
                    type: 'number',
                    default: 0.35,
                    description: 'Ignore matches whose similarity score falls below this (0–1).',
                },
            },
        },
    },
    ports: {
        in: {
            /** Several query vectors, one ranked list each. */
            vectors: S.vector,
            scope: S.chatScope,
        },
        out: {
            main: S.candidates,
            hits: S.candidates,
            /** One ranked list per query vector, in the order they were given. */
            lists: S.json,
            /**
             * `cos(i, j)` over `hits`, by index. What MMR needs, without any
             * embedding leaving the host.
             */
            similarity: S.json,
        },
    },
}));
export const personaCard = pin(describeQueryType({
    id: 'core:query/persona-card@1',
    timeoutMs: 1000,
    ports: {
        in: { characterId: S.json },
        out: { main: S.candidates, card: S.candidates },
    },
}));
export const messageText = pin(describeQueryType({
    id: 'core:query/message-text@1',
    timeoutMs: 1000,
    ports: {
        in: { messageId: S.json },
        out: { main: S.text, plain: S.text },
    },
}));
/** Illegal by construction elsewhere; used to prove the purity probe. */
export const network = pin(describeQueryType({
    id: 'test:query/network@1',
    timeoutMs: 1000,
    ports: { out: { main: S.json } },
}));
// ── Tasks ───────────────────────────────────────────────────────────────────
export const contextBudget = pin(describeTaskType({
    id: 'core:task/context-budget@1',
    timeoutMs: 500,
    slots: {
        /**
         * Where the window comes from.
         *
         * The context window is a column on `sampling_configs`, never a knob
         * on a node (17 §1a) — and the executor resolves a `sampling` slot to
         * the config's *values*, so this stays a pure Task reading data it
         * was handed rather than a Query looking one up.
         *
         * ⚠ Point this at the same config the generating step uses. A budget
         * computed against one window and a prompt sent against another is
         * wrong in the direction that truncates, silently.
         */
        sampling: { kind: 'sampling' },
        params: {
            kind: 'parameters',
            schema: {
                /**
                 * ⚠ There is no `reserveForReply` here, and there was: an
                 * integer defaulting to 512, sitting beside a
                 * `sampling_configs.response_tokens` that also defaults to
                 * 512. The same mistake as the ranker's `budget: 4096` —
                 * re-entering a number the system already knows, free to
                 * drift from the model actually being called and warning
                 * nobody when it did. Context in, response out: the reserve
                 * *is* the response allowance, so it is read, not typed.
                 */
                safetyMargin: {
                    type: 'number',
                    default: 0.05,
                    description: 'Fraction of the window kept free as a buffer against token-count drift.',
                },
            },
        },
    },
    ports: { out: { main: S.budget, available: S.budget } },
}));
export const mergeCandidates = pin(describeTaskType({
    id: 'core:task/merge-candidates@1',
    timeoutMs: 500,
    slots: {
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                strategy: {
                    type: 'enum',
                    of: ['auto', 'vector', 'keyword', 'hybrid'],
                    default: 'auto',
                    description: 'How retrieved sources are combined before ranking.',
                },
                dedup: {
                    type: 'boolean',
                    default: true,
                    description: 'Drop entries that more than one source retrieved.',
                },
            },
        },
    },
    ports: {
        in: { sources: S.candidates },
        out: { main: S.candidates, candidates: S.candidates },
    },
}));
const rankPorts = {
    in: { candidates: S.candidates, budget: S.budget },
    out: {
        main: S.candidates,
        candidates: S.candidates,
        /**
         * The per-candidate trail: score, included, reason, and the signal
         * breakdown behind it.
         *
         * A declared out-port rather than an implementation detail, because it is
         * what Assemble allocates from — and because a ranker swapped in by a
         * plugin has to produce it too, or the budget panel goes blank the moment
         * anyone changes rankers (16 §5c).
         */
        decisions: S.json,
    },
};
/**
 * Shared by every ranker: the ceiling it is ranking against.
 *
 * The default matters more than it looks. Until the executor applied declared
 * defaults, a spec that did not override this got `undefined` — a budget of
 * zero, every block excluded, and a prompt rendered with its lore silently
 * missing and no error anywhere.
 */
/**
 * The five things a context is built from.
 *
 * Declared once and shared by every control that renders per source, so a
 * plugin adding a sixth gets a labelled, coloured band everywhere without
 * touching a screen. `weights.ts` calls this `SourceKind`, and the two must
 * agree — the binding maps straight onto it.
 */
const SOURCES = [
    {
        key: 'messages',
        i18n: { en: 'Conversation' },
        description: { en: 'The chat itself — what was actually said.' },
        tone: 0,
    },
    {
        key: 'worldLore',
        i18n: { en: 'World lore' },
        description: { en: 'Lorebook entries about the world.' },
        tone: 1,
    },
    {
        key: 'characterLore',
        i18n: { en: 'Character lore' },
        description: { en: 'Lorebook entries bound to a character.' },
        tone: 2,
    },
    {
        key: 'history',
        i18n: { en: 'Story history' },
        description: { en: 'Summarised earlier events.' },
        tone: 3,
    },
    {
        key: 'relationships',
        i18n: { en: 'Relationships' },
        description: { en: 'The narrative graph. Off by default.' },
        tone: 4,
    },
];
/**
 * What the ranker is configured with.
 *
 * ⚠ This replaced a single `budget: integer` defaulting to 4096, and the change
 * is the point rather than a tidy-up. An absolute token count was wrong twice:
 * it re-entered a number the sampling config already carries, free to disagree
 * with the model actually being called; and it answered a question nobody asks.
 * Nobody wants to say "trim to 4096". They want to say "lore matters more than
 * old history in this chat, and never drop the last few messages".
 *
 * The available tokens now arrive on the `budget` in-port from
 * `core:task/context-budget@1`, which derives them from the window. What is
 * left here is the part that is genuinely a preference: how the context is
 * fought over once its size is known.
 *
 * `share` is normalised, so there is no invalid state — the total is always
 * 100%, dragging one band takes from the others and nowhere else, and zero is
 * a band's off switch. `DEFAULT_GROUPS` in `ranking/weights.ts` already
 * reproduces today's split exactly (0.5 to messages is `MESSAGE_FILL_FRACTION`),
 * so wiring this up is behaviour-preserving by construction.
 */
const rankSlots = {
    params: {
        kind: 'parameters',
        facet: 'weights',
        schema: {
            share: {
                type: 'share',
                members: SOURCES,
                default: {
                    messages: 0.5,
                    worldLore: 0.1667,
                    characterLore: 0.1667,
                    history: 0.1666,
                    relationships: 0,
                },
                i18n: { en: 'Context split' },
                description: {
                    en: 'How the context is divided between sources. Set a band to zero to leave it out.',
                },
            },
            maxEntries: {
                type: 'perMember',
                members: SOURCES,
                default: {
                    messages: 50,
                    worldLore: 20,
                    characterLore: 15,
                    history: 10,
                    relationships: 0,
                },
                i18n: { en: 'Most entries per source' },
                description: {
                    en: 'A ceiling on how many entries one source may contribute, whatever its share.',
                },
            },
            minMessageTokens: {
                type: 'integer',
                default: 512,
                min: 0,
                i18n: { en: 'Guaranteed conversation' },
                description: {
                    en: 'Tokens kept for the conversation regardless of its share, so a lore-heavy chat stays readable.',
                },
            },
        },
    },
};
export const rankHybrid = pin(describeTaskType({
    id: 'core:task/rank-hybrid@1',
    timeoutMs: 500,
    slots: rankSlots,
    ports: rankPorts,
}));
export const rankByRecency = pin(describeTaskType({
    id: 'core:task/rank-by-recency@1',
    timeoutMs: 500,
    slots: rankSlots,
    ports: rankPorts,
}));
/**
 * The two retrieval query windows, as text.
 *
 * A Task because *how a message is written when it is a query* is a decision —
 * speaker attribution in brackets, emphasis stripped — and a different
 * embedding model might want a different shape. It is also where the two
 * windows are cut, which is the parameter a user with long posts will reach for
 * first.
 */
export const queryWindows = pin(describeTaskType({
    id: 'core:task/query-windows@1',
    i18n: { name: { en: 'Retrieval queries' } },
    timeoutMs: 500,
    slots: {
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                currentWindow: {
                    type: 'integer',
                    default: 2,
                    description: "How many of the latest messages form the 'current' retrieval query.",
                },
                recentWindow: {
                    type: 'integer',
                    default: 3,
                    description: "How many messages before those form the wider 'recent' retrieval query.",
                },
            },
        },
    },
    ports: {
        in: { messages: S.messages, cast: S.chatCast },
        out: { main: S.json, current: S.json, recent: S.json },
    },
}));
/**
 * The semantic arm's ranking, as a Task.
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
export const rankSemantic = pin(describeTaskType({
    id: 'core:task/rank-semantic@1',
    i18n: { name: { en: 'Rank semantic results' } },
    timeoutMs: 1000,
    slots: {
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                currentWindow: {
                    type: 'integer',
                    default: 2,
                    description: "How many of the latest messages form the 'current' retrieval query.",
                },
                recentWindow: {
                    type: 'integer',
                    default: 3,
                    description: "How many messages before those form the wider 'recent' retrieval query.",
                },
                rrfK: {
                    type: 'integer',
                    default: 60,
                    description: 'Rank-fusion constant — higher values flatten the difference between ranks.',
                },
                recencyBoost: {
                    type: 'number',
                    default: 0.15,
                    description: 'Extra score given to recent entries.',
                },
                recencyDecay: {
                    type: 'number',
                    default: 0.01,
                    description: 'How quickly the recency boost fades per message of age.',
                },
                thresholdMin: {
                    type: 'number',
                    default: 0.3,
                    description: 'Minimum similarity a match needs to be considered at all.',
                },
                relativeThreshold: {
                    type: 'number',
                    default: 0.7,
                    description: 'Drop matches scoring below this fraction of the best match.',
                },
                mmrLambda: {
                    type: 'number',
                    default: 0.7,
                    description: 'Balance between relevance and variety — 1 is pure relevance, 0 maximum variety.',
                },
            },
        },
    },
    ports: {
        in: {
            /**
             * One entry per query window, each carrying its own per-message
             * ranked lists and its own similarity matrix. The whole stack
             * runs per window; the results are concatenated, not fused.
             */
            windows: S.json,
            messages: S.messages,
        },
        out: {
            main: S.candidates,
            candidates: S.candidates,
            diagnostics: S.json,
        },
    },
}));
/**
 * A plugin's ranker — same kind, same shape, so the swap list offers it (16 §5c).
 *
 * Named `rankRecall`, not `rankSemantic`: binding names derive from the id's
 * name segment and ignore the namespace, so this and `core:task/rank-semantic@1`
 * would both want to be `rankSemantic` and generation would emit one export
 * twice. `checkUnique` now catches that; the id changed here because a plugin
 * naming its ranker after its own product is the better name anyway.
 */
export const rankRecall = pin(describeTaskType({
    id: 'chariot.recall:rank-recall@1',
    timeoutMs: 500,
    public: true,
    ports: rankPorts,
}));
export const renderEntries = pin(describeTaskType({
    id: 'core:task/render-entries@1',
    timeoutMs: 500,
    slots: {
        template: {
            kind: 'template',
            engine: jinja2.id,
            facet: 'templates',
            description: 'How a retrieved entry is written into the context. Leave empty to use the built-in wording.',
        },
    },
    ports: {
        in: { entries: S.candidates },
        out: { main: S.renderedBlocks },
    },
}));
export const assemble = pin(describeTaskType({
    id: 'core:task/assemble@2',
    timeoutMs: 1000,
    slots: {
        // An *assembly* template: its scope really is the input ports, so this half of
        // 16 §4's claim holds.
        template: {
            kind: 'template',
            // Handlebars, not Jinja: this is the engine Serene Pub's context
            // configs are written in, and the assembly template is the user's
            // existing story string. Declaring the wrong engine would fail
            // parity in a way that reads as a template bug rather than a
            // configuration mistake (12 §2a).
            engine: handlebars.id,
            facet: 'templates',
            variables: {
                blocks: 'any',
                budget: ['total', 'remaining'],
                prompts: ['system', 'postHistory'],
            },
            description: 'The story string: the overall layout of the finished prompt — where the character cards, lore, history and instructions sit. Leave empty to use the built-in layout.',
        },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: {
                system: { type: 'text' },
                postHistory: { type: 'text' },
            },
        },
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
        variables: {
            kind: 'variables',
            facet: 'variables',
            description: 'How the retrieved lore and history are laid out — JSON, prose, or whatever you write. Duplicate one to change it.',
            renders: {
                worldLore: 'core:var/world-lore@1',
                history: 'core:var/history@1',
                currentDate: 'core:var/current-date@1',
            },
        },
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
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
                postHistoryDepth: {
                    type: 'integer',
                    default: 0,
                    description: 'Place the post-history reminder this many messages before the end. 0 puts it last.',
                },
                postHistoryTokenTrigger: {
                    type: 'integer',
                    default: 0,
                    description: 'Only add the reminder once the chat is at least this many tokens long. 0 always adds it.',
                },
                truncation: {
                    type: 'enum',
                    of: ['oldest-first', 'lowest-weight'],
                    default: 'oldest-first',
                    description: 'What gets dropped first when the context is over budget.',
                },
            },
        },
    },
    ports: {
        in: {
            candidates: S.candidates,
            budget: S.budget,
            templateContext: S.templateContext,
        },
        out: { main: S.assembled, context: S.assembled },
    },
}));
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
export const chatCast = pin(describeQueryType({
    id: 'core:query/chat-cast@1',
    i18n: { name: { en: 'Chat cast' } },
    timeoutMs: 2000,
    ports: {
        in: { scope: S.chatScope },
        out: { main: S.chatCast, cast: S.chatCast },
    },
}));
/**
 * The speaker-centric relationship summary from the narrative graph.
 *
 * A Query, not part of the context Task, because it is a *read* — three layers
 * of relationship rows scoped to the chat's lorebook and the speaking
 * character's bound node — and a Task is handed no services (F11). Making it
 * its own node is also what puts it on the spine: visible to the receipt, and
 * removable by anyone who does not want it, without editing the context
 * builder.
 *
 * Emits text rather than rows: `buildGraphContext` already renders the summary
 * to JSON, and re-deriving it here would be a second implementation of a shape
 * the legacy path and the pipeline both have to agree on.
 */
export const graphContext = pin(describeQueryType({
    id: 'core:query/graph-context@1',
    i18n: {
        name: { en: 'Graph relationships' },
        description: {
            en: "The speaking character's relationships, read from the narrative graph. Produces nothing when the chat has no lorebook or the speaker has no node in it.",
        },
    },
    /**
     * Optional enrichment: a slow or failing relationship read must never
     * cost somebody their reply.
     *
     * The executor turns an `err` from an optional node into an empty
     * result and carries on, recording the failure in the receipt
     * (`recoveredAsEmpty`). The template already guards this block with
     * `{{#if speakerRelationships}}`, so an empty value renders nothing —
     * which is exactly what a chat with no narrative graph gets anyway.
     */
    optional: true,
    /**
     * A three-layer traversal — the speaker's own relationships, the
     * inverse ones pointed at them, and any legendary bindings — each a
     * separate round trip. Back to a real latency budget now that
     * exceeding it degrades instead of failing the turn; it briefly sat at
     * 15s only because a timeout used to halt the run.
     */
    timeoutMs: 5000,
    ports: {
        in: { scope: S.chatScope },
        /**
         * `json`, not `text`. The summary used to be stringified inside
         * `buildGraphContext` and handed on as a finished blob, which made
         * it the one context value a layout could do nothing with — you
         * cannot render relationships as prose, drop a section, or even
         * change the indent if the shape was flattened upstream. The node
         * now emits the structure and the variable layout renders it.
         */
        out: { main: S.json, speakerRelationships: S.json },
    },
}));
/**
 * The ports both context builders expose. Identical because the two nodes do
 * the same job — the difference between them is entirely what can be
 * *configured*, which is what a node type is for.
 */
const contextPorts = {
    in: { cast: S.chatCast },
    out: {
        main: S.templateContext,
        templateContext: S.templateContext,
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
        seedName: S.text,
    },
};
const PROMPTS_DESCRIPTION = 'The written instructions this pipeline sends the model — pick a prompt, or duplicate one and make it yours.';
/**
 * How each value this node produces is *presented*.
 *
 * Every one of these was a `JSON.stringify` in TypeScript, indentation and all
 * — so "render my characters as prose" was a code change rather than a setting.
 * Each key here points at a swappable template row, selected the way a prompt
 * is, and keyed by the variable it renders rather than by this spec: a prose
 * rendering written here is selectable from any pipeline that renders the same
 * variable.
 *
 * The shipped rows reproduce the old TypeScript byte for byte. The JSON shape is
 * not a default anyone drifted into — it was A/B tested before 0.1.0 and
 * measurably improved how reliably models hold a character — so prose is opt-in
 * and stays that way.
 */
const VARIABLES_DESCRIPTION = 'How each part of the prompt is laid out — JSON, prose, or whatever you write. Duplicate one to change it.';
/** Rendered by every context builder, whoever is speaking. */
const sharedRenders = {
    instructions: 'core:var/instructions@1',
    characters: 'core:var/characters@1',
    personas: 'core:var/personas@1',
    scenario: 'core:var/scenario@1',
    postHistoryInstructions: 'core:var/post-history-instructions@1',
    characterNames: 'core:var/character-names@1',
    personaNames: 'core:var/persona-names@1',
};
/**
 * The reply pipeline's context builder.
 *
 * ## Why the narrator has its own type
 *
 * Through 0.6.0 both pipelines pinned this one, and the panel is generated from
 * the registry row — so each advertised the other's controls. Reply prompts all
 * carried an empty `narratorName` box, and the narrator offered layout pickers
 * for `exampleDialogue` (which comes from the speaking character it does not
 * have) and `speakerRelationships` (which its spec deliberately never supplies).
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
export const buildTemplateContext = pin(describeTaskType({
    id: 'core:task/build-template-context@1',
    i18n: { name: { en: 'Build template context' } },
    timeoutMs: 2000,
    /**
     * The example-dialogue pick. Declaring it is what gets `ctx.random` — the
     * run-seeded RNG — instead of `Math.random()`, so the same run replayed
     * chooses the same example and a different turn still gets variety.
     */
    declaresRandomness: true,
    /**
     * The authored text. It arrives as config rather than on a port because it
     * *is* config — the same prompt config the assembly template renders from,
     * layered instance → user → chat like every other slot.
     */
    slots: {
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            description: PROMPTS_DESCRIPTION,
            fields: {
                systemPrompt: { type: 'text' },
                postHistoryInstructions: { type: 'text' },
            },
        },
        variables: {
            kind: 'variables',
            facet: 'variables',
            description: VARIABLES_DESCRIPTION,
            renders: {
                ...sharedRenders,
                /** From the speaking character's card. */
                exampleDialogue: 'core:var/example-dialogue@1',
                /** From the narrative graph, in the speaker's perspective. */
                speakerRelationships: 'core:var/speaker-relationships@1',
            },
        },
    },
    ports: contextPorts,
}));
/**
 * The narrator pipeline's context builder.
 *
 * Same implementation, same ports, different surface — see
 * `buildTemplateContext` for why that makes it a different type.
 *
 * What it drops: `exampleDialogue`, which `characterExampleDialogue` reads off
 * the speaking character and so is always empty here, and
 * `speakerRelationships`, which the narrate spec never supplies because graph
 * context needs a speaker's perspective and a narrator has none.
 *
 * What it adds: `narratorName`. Load-bearing rather than cosmetic — it is the
 * name on the seed line the model continues from, and `{{narratorName}}` in the
 * narrator's own prompt text.
 *
 * No `declaresRandomness`: the only random choice this node ever made was which
 * example dialogue to use, and it has none to choose from.
 */
export const buildNarratorContext = pin(describeTaskType({
    id: 'core:task/build-narrator-context@1',
    i18n: { name: { en: 'Build narrator context' } },
    timeoutMs: 2000,
    slots: {
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            description: PROMPTS_DESCRIPTION,
            fields: {
                systemPrompt: { type: 'text' },
                postHistoryInstructions: { type: 'text' },
                narratorName: { type: 'text' },
            },
        },
        variables: {
            kind: 'variables',
            facet: 'variables',
            description: VARIABLES_DESCRIPTION,
            renders: { ...sharedRenders },
        },
    },
    ports: contextPorts,
}));
/**
 * Chat rows into the objects a template renders.
 *
 * A Task rather than part of the history Query, because naming a message —
 * which participant said it, under what name at the time — is a *decision*, and
 * decisions are the things a plugin should be able to replace. The Query returns
 * rows; this says who spoke.
 */
export const processMessages = pin(describeTaskType({
    id: 'core:task/process-messages@1',
    i18n: { name: { en: 'Process messages' } },
    timeoutMs: 1000,
    ports: {
        in: {
            messages: S.messages,
            cast: S.chatCast,
            templateContext: S.templateContext,
            seedName: S.text,
        },
        out: { main: S.messages, messages: S.messages },
    },
}));
/** Turns provider output back into candidate blocks — the map/reduce join. */
export const toCandidates = pin(describeTaskType({
    id: 'core:task/to-candidates@1',
    timeoutMs: 500,
    ports: {
        in: { items: S.text },
        out: { main: S.candidates, candidates: S.candidates },
    },
}));
/** An author defaulting review ON for their own consumer — and unable to forbid it (F14). */
export const attachImage = pin(describeConsumerTarget({
    id: 'core:consumer/attach-image@1',
    effects: 'write',
    timeoutMs: 5000,
    reviewDefault: 'on',
    causesEvent: 'core:event/message-updated@1',
    ports: { in: { image: S.image }, out: { main: S.writeResult } },
}));
export const chunkText = pin(describeTaskType({
    id: 'core:task/chunk-text@1',
    timeoutMs: 1000,
    ports: { in: { text: S.text }, out: { main: S.json, items: S.json } },
}));
export const roll = pin(describeTaskType({
    id: 'chariot.dice-tray:roll@1',
    i18n: { name: { en: 'Roll dice' } },
    timeoutMs: 200,
    declaresRandomness: true,
    public: true,
    ports: {
        in: { notation: S.text },
        out: { main: S.json, total: S.json },
    },
}));
export const gate = pin(describeTaskType({
    id: 'test:task/gate@1',
    timeoutMs: 500,
    ports: { in: { main: S.json }, out: { main: S.json } },
}));
export const slow = pin(describeTaskType({
    id: 'test:task/slow@1',
    timeoutMs: 30,
    ports: { in: { main: S.json }, out: { main: S.json } },
}));
export const passthrough = pin(describeTaskType({
    id: 'test:task/passthrough@1',
    timeoutMs: 500,
    toggleable: true,
    ports: { in: { main: S.json }, out: { main: S.json } },
}));
export const badToggleable = pin(describeTaskType({
    id: 'test:task/bad-toggleable@1',
    timeoutMs: 500,
    toggleable: true,
    ports: { in: { main: S.text }, out: { main: S.image } },
}));
// ── Providers — identical structure across three modalities (17 §2) ─────────
export const embedText = pin(describeProvider({
    id: 'core:provider/embed-text@1',
    shape: S.embeddings,
    effects: 'external',
    timeoutMs: 5000,
    slots: {
        connection: { kind: 'connection', shape: S.embeddings },
        params: {
            kind: 'parameters',
            schema: {
                enabled: {
                    type: 'enum',
                    of: ['auto', 'on', 'off'],
                    default: 'auto',
                },
            },
        },
    },
    ports: {
        in: {
            text: S.text,
            /** Batched: one call, one vector each, in order. */
            texts: S.json,
        },
        out: { main: S.vector, vector: S.vector, vectors: S.json },
    },
}));
export const generateText = pin(describeProvider({
    id: 'core:provider/generate-text@1',
    i18n: { name: { en: 'Generate reply' } },
    shape: S.textGen,
    effects: 'external',
    timeoutMs: 120000,
    timeoutKind: 'idle',
    usage: 'response.usage',
    slots: {
        connection: {
            kind: 'connection',
            shape: S.textGen,
            description: 'Which model server this step sends its request to.',
        },
        sampling: {
            kind: 'sampling',
            shape: S.textGen,
            description: 'The sampling settings — temperature and friends — used for this request.',
        },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            description: 'The written instructions sent with every request from this step.',
            fields: {
                system: { type: 'text' },
                postHistory: { type: 'text' },
            },
        },
        template: {
            kind: 'template',
            engine: jinja2.id,
            facet: 'templates',
            description: 'How the assembled context is wrapped for this model before sending. Leave empty to use the format the connection expects.',
        },
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                stopSequences: {
                    type: 'string[]',
                    description: 'Sequences that end the reply the moment the model writes one. One per line.',
                },
            },
        },
    },
    ports: {
        in: { context: S.assembled },
        out: { main: S.textStream, text: S.textStream },
    },
}));
export const speak = pin(describeProvider({
    id: 'core:provider/speak@1',
    i18n: { name: { en: 'Speak' } },
    shape: S.tts,
    effects: 'external',
    timeoutMs: 60000,
    slots: {
        connection: { kind: 'connection', shape: S.tts },
        sampling: { kind: 'sampling', shape: S.tts },
        template: {
            kind: 'template',
            engine: jinja2.id,
            facet: 'templates',
        },
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: { skipCodeBlocks: { type: 'boolean', default: true } },
        },
    },
    ports: { in: { text: S.text }, out: { main: S.audio, audio: S.audio } },
}));
export const renderImage = pin(describeProvider({
    id: 'chariot.comfy:render-image@1',
    shape: S.imageGen,
    effects: 'external',
    public: true,
    timeoutMs: 300000,
    slots: {
        connection: { kind: 'connection', shape: S.imageGen },
        sampling: { kind: 'sampling', shape: S.imageGen },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: {
                positive: { type: 'text' },
                negative: { type: 'text' },
            },
        },
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: { steps: { type: 'integer', default: 25 } },
        },
    },
    ports: {
        in: { context: S.assembled },
        out: { main: S.image, image: S.image },
    },
}));
/** An MCP tool. Effectful by default — annotations never decide gating (F31, 14 §4). */
export const mcpTool = pin(describeProvider({
    id: 'core:provider/mcp-tool@1',
    shape: S.json,
    effects: 'external',
    timeoutMs: 30000,
    slots: { connection: { kind: 'connection', shape: S.json } },
    ports: { in: { args: S.json }, out: { main: S.json, result: S.json } },
}));
/** Consumes a stream and may finish before it ends (01 §11). */
export const firstJson = pin(describeTaskType({
    id: 'core:task/first-json@1',
    timeoutMs: 5000,
    earlyExit: true,
    ports: { in: { main: S.textStream }, out: { main: S.json } },
}));
/** Same in-port, but no earlyExit declared — used to prove stream-abandoned. */
export const sloppyStream = pin(describeTaskType({
    id: 'test:task/sloppy-stream@1',
    timeoutMs: 5000,
    ports: { in: { main: S.textStream }, out: { main: S.json } },
}));
// ── Consumers ───────────────────────────────────────────────────────────────
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
export const createMessage = pin(describeConsumerTarget({
    id: 'core:consumer/create-message@1',
    effects: 'write',
    timeoutMs: 5000,
    causesEvent: 'core:event/message-created@1',
    ports: {
        in: { text: S.text },
        out: { main: S.writeResult, messageId: S.writeResult },
    },
}));
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
export const updateMessage = pin(describeConsumerTarget({
    id: 'core:consumer/update-message@1',
    effects: 'write',
    timeoutMs: 5000,
    causesEvent: 'core:event/message-updated@1',
    ports: {
        in: { target: S.rowIds, text: S.text },
        out: { main: S.writeResult, messageId: S.writeResult },
    },
}));
export const attachAudio = pin(describeConsumerTarget({
    id: 'core:consumer/attach-audio@1',
    effects: 'write',
    timeoutMs: 5000,
    causesEvent: 'core:event/message-updated@1',
    ports: { in: { audio: S.audio }, out: { main: S.writeResult } },
}));
export const savePluginData = pin(describeConsumerTarget({
    id: 'core:consumer/save-plugin-data@1',
    effects: 'write',
    timeoutMs: 5000,
    ports: { in: { value: S.json }, out: { main: S.writeResult } },
}));
export const emitSocket = pin(describeConsumerTarget({
    id: 'core:consumer/emit-socket@1',
    effects: 'emit',
    timeoutMs: 1000,
    ports: { in: { from: S.json }, out: { main: S.json } },
}));
// ── Summarization ───────────────────────────────────────────────────────────
//
// Two phases, and the split is the whole design (see `utils/summarizer`):
// messages are cut into token-sized batches and each is drafted **on its own**,
// then the ordered drafts are merged into one narrative. Drafting a batch in
// isolation is what keeps a long chat summarizable at all — the model never
// sees more than one batch — and it is why the batch step is a `map` rather
// than a loop: the batches do not depend on each other, so nothing forces them
// to be sequential except the connection's own queue.
//
// Each step is its own Provider because each has its own prompt, connection and
// sampling config in the tables this replaces. That was already true; it was
// just spelled as `batch_system_prompt` / `synth_connection_id` columns rather
// than as nodes.
export const summarizeRequest = pin(describeInput({
    id: 'core:input/summarize-request@1',
    ports: {
        out: {
            main: S.summarizeRequest,
            scope: S.chatScope,
            request: S.summarizeRequest,
        },
    },
}));
/** The messages a summary is drawn from, already scoped and ordered. */
export const summarizeSource = pin(describeQueryType({
    id: 'core:query/summarize-source@1',
    i18n: { name: { en: 'Messages to summarize' } },
    timeoutMs: 5000,
    ports: {
        in: { scope: S.chatScope, request: S.summarizeRequest },
        out: { main: S.messages, messages: S.messages },
    },
}));
/**
 * Cut the messages into batches a model can hold.
 *
 * A Task, not a Query: the cut is a *decision* — how many tokens per batch, and
 * therefore how much context each draft is written against — and it is the
 * first parameter a user with long posts reaches for.
 */
export const batchMessages = pin(describeTaskType({
    id: 'core:task/batch-messages@1',
    i18n: { name: { en: 'Batch messages' } },
    timeoutMs: 2000,
    slots: {
        params: {
            kind: 'parameters',
            facet: 'weights',
            schema: {
                batchTokens: {
                    type: 'integer',
                    default: 2048,
                    description: 'How many tokens of chat each summarizing batch holds.',
                },
                minBatchMessages: {
                    type: 'integer',
                    default: 1,
                    description: 'Never cut a batch smaller than this many messages.',
                },
            },
        },
    },
    ports: {
        in: { messages: S.messages },
        out: { main: S.drafts, batches: S.drafts },
    },
}));
/** Phase 1 — one batch, drafted without sight of any other. */
export const summarizeBatch = pin(describeProvider({
    id: 'core:provider/summarize-batch@1',
    i18n: { name: { en: 'Draft a batch' } },
    shape: S.textGen,
    effects: 'external',
    timeoutMs: 120000,
    timeoutKind: 'idle',
    usage: 'response.usage',
    slots: {
        connection: { kind: 'connection', shape: S.textGen },
        sampling: { kind: 'sampling', shape: S.textGen },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: { batch: { type: 'text' } },
        },
    },
    ports: {
        // `request` carries what a person asked for — the topic line, most
        // visibly — so the drafting prompt can honour it. The whole request
        // object travels rather than a plucked field, because what the
        // request holds is the socket's contract with its modal, not this
        // node's to enumerate.
        in: { batch: S.messages, request: S.summarizeRequest },
        out: { main: S.textStream, draft: S.textStream },
    },
}));
/** Phase 2 — the ordered drafts merged into one past-tense narrative. */
export const summarizeSynth = pin(describeProvider({
    id: 'core:provider/summarize-synth@1',
    i18n: { name: { en: 'Synthesize the drafts' } },
    shape: S.textGen,
    effects: 'external',
    timeoutMs: 120000,
    timeoutKind: 'idle',
    usage: 'response.usage',
    slots: {
        connection: { kind: 'connection', shape: S.textGen },
        sampling: { kind: 'sampling', shape: S.textGen },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: { synth: { type: 'text' } },
        },
    },
    ports: {
        // Same `request` pass-through as the batch step: the topic reaches
        // synthesis too, or a focused summary drifts back to a general one
        // the moment the drafts are merged.
        in: { drafts: S.drafts, request: S.summarizeRequest },
        out: { main: S.textStream, content: S.textStream },
    },
}));
/** What the entry gets called. Its own step because it has its own prompt. */
export const nameEntry = pin(describeProvider({
    id: 'core:provider/name-entry@1',
    i18n: { name: { en: 'Name the entry' } },
    shape: S.textGen,
    effects: 'external',
    timeoutMs: 60000,
    usage: 'response.usage',
    slots: {
        connection: { kind: 'connection', shape: S.textGen },
        sampling: { kind: 'sampling', shape: S.textGen },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: { name: { type: 'text' } },
        },
    },
    ports: {
        in: { content: S.text },
        out: { main: S.textStream, name: S.textStream },
    },
}));
/**
 * Who was in the scene — scene summaries only.
 *
 * Present on one summarize pipeline and not the other three, which is exactly
 * why they are four specs rather than one spec with a flag. A flag would put the
 * difference in a condition somebody has to find; four specs put it in the shape.
 */
export const extractCast = pin(describeProvider({
    id: 'core:provider/extract-cast@1',
    i18n: { name: { en: 'Extract the cast' } },
    shape: S.textGen,
    effects: 'external',
    timeoutMs: 60000,
    usage: 'response.usage',
    slots: {
        connection: { kind: 'connection', shape: S.textGen },
        sampling: { kind: 'sampling', shape: S.textGen },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: { characterExtraction: { type: 'text' } },
        },
    },
    ports: {
        // `request` carries the known cast list ([id: N] entries) so the
        // extraction prompt can reference real ids — without it the model
        // invents castIds and the resolve step silently drops every one.
        in: {
            content: S.text,
            messages: S.messages,
            request: S.summarizeRequest,
        },
        out: { main: S.json, cast: S.json },
    },
}));
/** Write the finished entry. Gate-eligible, so it publishes a write result. */
export const createLoreEntry = pin(describeConsumerTarget({
    id: 'core:consumer/create-lore-entry@1',
    i18n: { name: { en: 'Save the lore entry' } },
    effects: 'write',
    timeoutMs: 10000,
    causesEvent: 'core:event/lore-entry-created@1',
    ports: {
        in: { name: S.text, content: S.text },
        out: { main: S.writeResult, entryId: S.writeResult },
    },
}));
// ── Graph build ─────────────────────────────────────────────────────────────
//
// Five LLM steps, each already independently configurable in
// `graph_build_configs` as a `<step>_system_prompt` / `<step>_connection_id` /
// `<step>_sampling_config_id` triple. Five Providers is the same statement with
// the enumeration removed.
export const graphScenes = pin(describeQueryType({
    id: 'core:query/graph-scenes@1',
    i18n: { name: { en: 'Scenes to build from' } },
    timeoutMs: 5000,
    ports: {
        in: { scope: S.chatScope },
        out: { main: S.graphScenes, scenes: S.graphScenes },
    },
}));
const graphStep = (id, label, field, extra = {}) => pin(describeProvider({
    id,
    i18n: { name: { en: label } },
    shape: S.textGen,
    effects: 'external',
    timeoutMs: extra.timeoutMs ?? 120000,
    timeoutKind: 'idle',
    usage: 'response.usage',
    slots: {
        connection: { kind: 'connection', shape: S.textGen },
        sampling: { kind: 'sampling', shape: S.textGen },
        prompts: {
            kind: 'prompts',
            facet: 'prompts',
            fields: { [field]: { type: 'text' } },
        },
    },
    ports: {
        in: { scenes: S.graphScenes },
        out: { main: S.json, result: S.json },
    },
}));
/** Which existing node a mentioned name refers to, or whether it is new. */
export const graphNodeResolution = graphStep('core:provider/graph-node-resolution@1', 'Resolve nodes', 'nodeResolution');
/** Drop what is not worth graphing before the expensive steps run. */
export const graphPreFilter = graphStep('core:provider/graph-pre-filter@1', 'Pre-filter', 'preFilter');
/** Whose account of the scene this is. */
export const graphPerspective = graphStep('core:provider/graph-perspective@1', 'Perspective', 'perspective');
/** The two-sentence introduction written for a newly discovered character. */
export const graphNodeDescription = graphStep('core:provider/graph-node-description@1', 'Describe new nodes', 'nodeDescription');
/** Did any present character reach a new lifecycle state this scene? */
export const graphStateDetection = graphStep('core:provider/graph-state-detection@1', 'Detect state changes', 'stateDetection');
/**
 * The proposal, held for review.
 *
 * `effects: 'write'` and therefore gate-eligible, which is the mechanism behind
 * the rule that a graph build **stops at the review screen** and never applies
 * itself. Under `async` review the proposal is exactly that — a proposal — and
 * `write-result@1` is the shape that refuses to be mistaken for row ids.
 */
export const graphProposal = pin(describeConsumerTarget({
    id: 'core:consumer/graph-proposal@1',
    i18n: { name: { en: 'Propose graph changes' } },
    effects: 'write',
    timeoutMs: 10000,
    causesEvent: 'core:event/graph-proposal-created@1',
    ports: {
        in: { proposal: S.json },
        out: { main: S.writeResult, proposalId: S.writeResult },
    },
}));
//# sourceMappingURL=index.js.map