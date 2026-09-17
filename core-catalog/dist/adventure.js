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
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { adventureGenre } from './genres.js';
/* ── create ─────────────────────────────────────────────────────────────── */
export const ADVENTURE_CREATE_SPEC_ID = 'core:spec/adventure-create';
export const ADVENTURE_CREATE_VERSION = '1.0.0';
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
export const adventureCreateSpec = () => compile(spec(ADVENTURE_CREATE_SPEC_ID, {
    version: ADVENTURE_CREATE_VERSION,
    taxonomy: {
        role: 'create',
        genre: adventureGenre.id,
    },
    genre: {
        name: adventureGenre.name,
        family: adventureGenre.family,
        description: adventureGenre.description,
        shape: adventureGenre.shape,
        events: adventureGenre.events,
    },
})
    .inlet('input', C.sessionCreated.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionCreated,
})
    .query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
    .outlet('seed', ($) => C.seedGreetings.v1({
    greetings: $.collect.greetings,
    channel: adventureGenre.shape?.greeting?.channel ?? 'main',
}))
    .build());
/* ── respond ────────────────────────────────────────────────────────────── */
export const ADVENTURE_RESPOND_SPEC_ID = 'core:spec/adventure-respond';
export const ADVENTURE_RESPOND_VERSION = '1.0.0';
/* ── Why the narrator uses the shipped story string like everybody else ─────
 *
 * This genre shipped an ASSEMBLY template of its own for the narrator, opening
 * with the plan and the world state. Every line of it was wrong, and a live
 * receipt is what said so: `{{{system}}}` and `{{{chatMessages}}}` are not
 * variables a context template has, so the narrator's prompt arrived with **no
 * instructions and no transcript at all**; `{{{plan}}}` and `{{{state}}}` are
 * structure rather than rendered text, so both blocks rendered the literal
 * `[object Object]`. The scene the model then wrote was set on a dock nobody had
 * mentioned, with a character nobody had written, which is exactly what a model
 * handed two object stubs and no instructions should be expected to write.
 *
 * The shipped story string is the one that carries the system block, the cards,
 * the allocated lore bands, the conversation and the response reminder, and it
 * is what the other three stages here already assemble with. So the narrator
 * uses it too, and everything this template was reaching for — where the scene
 * is, who is in it, what the plan says happens, what the numbers are — is in
 * the narrator's INSTRUCTIONS instead, which is an editable prompt row rather
 * than a template only an author can reach.
 */
/** How many cast members may speak in one turn. Mandatory (F9) and small. */
const MAX_SPEAKERS = 4;
/* ── The two schemas ────────────────────────────────────────────────────────
 *
 * What the planner and the keeper must answer with, as JSON Schema, travelling
 * on `core:oracle/generate-json@1`'s `schema` port.
 *
 * ⚠ **Contract, not decoration, in both directions.** The key names here are the
 * key names the `path` parameters select and the shapes
 * `core:query/resolve-state-changes@1` resolves, exactly as the prose in the
 * shipped prompts is — the difference is that these reach the WIRE, so a model
 * that would have ignored the prose cannot ignore them.
 *
 * ## Why every property is required, and every string a string
 *
 * A schema on this port is enforced three ways depending on the connection:
 * natively by Ollama and the OpenAI family, and by compilation to a GBNF grammar
 * on the llama.cpp family. That last path is the narrow one — it admits objects,
 * arrays, strings, numbers and booleans, all properties required — and a schema
 * outside it is REFUSED rather than loosened. So these stay inside it, which
 * costs the planner one word per world hint (it restates what has not changed)
 * and costs the keeper a `value` written as text.
 *
 * `value` being text is the one place the schema and the store disagree on
 * purpose: `hp` is an integer slot and the keeper writes `"14"`.
 * `resolve-state-changes` is where a name becomes a row and a written value
 * becomes the slot's own type, which is the step that knows which slot it is.
 */
/** The four world values the keeper may set, by the names the prompts use. */
const TRACKED_SLOTS = ['hp', 'stamina', 'mood', 'trust', 'location', 'time-of-day', 'weather'];
export const ADVENTURE_PLAN_SCHEMA = {
    type: 'object',
    properties: {
        beats: { type: 'array', items: { type: 'string' } },
        speakers: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    intent: { type: 'string' },
                },
                required: ['name', 'intent'],
                additionalProperties: false,
            },
        },
        worldHints: {
            type: 'object',
            properties: {
                location: { type: 'string' },
                timeOfDay: {
                    type: 'string',
                    enum: ['morning', 'day', 'dusk', 'night'],
                },
                weather: {
                    type: 'string',
                    enum: ['clear', 'fog', 'rain', 'storm', 'snow'],
                },
            },
            required: ['location', 'timeOfDay', 'weather'],
            additionalProperties: false,
        },
        needsLookup: { type: 'boolean' },
    },
    required: ['beats', 'speakers', 'worldHints', 'needsLookup'],
    additionalProperties: false,
};
export const ADVENTURE_KEEPER_SCHEMA = {
    type: 'object',
    properties: {
        /** A tracked value the scene changed. Empty is the ordinary turn. */
        values: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    owner: { type: 'string' },
                    slot: { type: 'string', enum: TRACKED_SLOTS },
                    value: { type: 'string' },
                },
                required: ['owner', 'slot', 'value'],
                additionalProperties: false,
            },
        },
        /**
         * Something changing hands, by the entry id the lore gave it.
         *
         * Its own list rather than a second arm inside `values`, because a
         * schema can only be strict about a list whose items are all one shape.
         * The two are joined again by the `path` parameter naming both.
         */
        possessions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    owner: { type: 'string' },
                    entryId: { type: 'integer' },
                    delta: { type: 'integer' },
                },
                required: ['owner', 'entryId', 'delta'],
                additionalProperties: false,
            },
        },
    },
    required: ['values', 'possessions'],
    additionalProperties: false,
};
export const adventureRespondSpec = () => compile(spec(ADVENTURE_RESPOND_SPEC_ID, {
    version: ADVENTURE_RESPOND_VERSION,
    taxonomy: {
        role: 'primary',
        genre: adventureGenre.id,
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.messageRespond,
})
    /**
     * The reply row, created by the pipeline that fills it (R-17) —
     * see `respond`'s `placeholder`. Four agents run before `save`
     * has anything to write, and this is what a player watches
     * meanwhile: the narrator's prose streams into it, the planner's
     * and keeper's JSON do not (core routes one oracle's stream to the
     * live row — the one nearest the write).
     */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    characterId: $.input.characterId,
    row: $.input.messageId,
}))
    /**
     * One retrieval pass, shared by all four agents.
     *
     * Every branch takes `input.sessionScope` and none reads another's
     * output, so they run together for the reason the reply pipeline's
     * gather does. `state` joins them here: it is a read like any other,
     * and every agent below is handed the same answer rather than each
     * asking again and getting three slightly different worlds.
     */
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('worldLore', (c) => c.query('read', ($) => C.worldLore.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('characterLore', (c) => c.query('read', ($) => C.characterLore.v1({
    scope: $.input.sessionScope,
    // Settings live on the world-lore lane (R-7 P2, one owner per
    // setting per spec) — the three lanes declare the same seven knobs.
    params: slot.params({ node: 'gather.worldLore.read' }),
})))
    .chain('historyEntries', (c) => c.query('read', ($) => C.historyEntries.v1({
    scope: $.input.sessionScope,
    // Settings live on the world-lore lane (R-7 P2, one owner per
    // setting per spec) — the three lanes declare the same seven knobs.
    params: slot.params({ node: 'gather.worldLore.read' }),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    /**
     * The bars, the chips and the inventory, already resolved
     * down session → lorebook → card → declaration default.
     * This is the port the whole genre turns on: three of the
     * four agents read it, and the fourth writes to it.
     */
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))))
    /**
     * The window, taken from the step whose prose actually fills it.
     *
     * `samplingOf("scene")` rather than a slot of its own, for the
     * reason the reply pipeline gives: a budget computed against one
     * window and a prompt sent against another truncates silently. The
     * planner and the keeper are cheap and short and ride the same
     * allocation; if an admin points them at a smaller model, the only
     * cost is a prompt smaller than it had to be.
     */
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('scene'),
    // The other half of the same pair, for the model's own
    // window (0114) — see `respond`.
    connection: slot.connectionOf('scene'),
    params: slot.params(),
}))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [
        // The conversation's band intent alone — see `respond`'s
        // `lore` node (R-7 P5): it reserves the transcript's slice
        // of the window; the lanes' own intents ride in `main`.
        $.gather.history.read.band,
        $.gather.worldLore.read.main,
        $.gather.characterLore.read.main,
        $.gather.historyEntries.read.main,
    ],
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.lore.candidates,
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    /* ── plan ───────────────────────────────────────────────────── */
    .task('planContext', ($) => C.buildPlannerContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /**
     * The conversation the two JSON stages read: prose, and no turn to
     * continue.
     *
     * One transcript for both of them, because they read the same
     * conversation and two reads of one fact are two chances to
     * disagree about who said what. The narrator and the voices build
     * their own, and each of those IS somebody's turn.
     *
     * `prose-transcript` rather than `process-messages` for two reasons
     * that are the same reason: a step that is asking a question must
     * not be handed a line with its own name on the end of it, and it
     * must not be shown the JSON an earlier turn's answer left in the
     * session. Both are properties of the transcript rather than of the
     * request — by the time a completion prompt is rendered, the seed is
     * an open block inside one string and nothing downstream can take it
     * back out.
     */
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.planContext.templateContext,
}))
    .task('planPrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.planContext.templateContext,
    template: slot.template(),
    // The planner's authored text, by reference: one prompt,
    // written once, on the node that owns the surface.
    prompts: slot.prompts({ node: 'planContext' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('planWrite'),
}))
    /**
     * `{ beats, speakers, worldHints, needsLookup }`, asked for as a
     * SHAPE and published as data.
     *
     * `generate-json` rather than `generate-text` + `parse-json`, and the
     * difference is on the wire rather than in the node count. Asked as
     * an ordinary reply, this step was a roleplay continuation with a
     * schema described in its instructions: the model wrote the
     * character's next paragraph and appended the JSON underneath, which
     * the parser then salvaged. Asked as a request for a document, the
     * shape travels in the field the connection's service calls it and
     * there is no prose to salvage from.
     *
     * `params.path` is `speakers` (set in the preset below), so `items`
     * is the speaker list a `map` can iterate while `json` is still the
     * whole plan. An answer the node cannot read subtracts the plan and
     * nothing else — it is optional, so the turn narrates without one
     * rather than failing, and `parseError` says which way it failed.
     */
    .oracle('planWrite', ($) => C.generateJson.v1({
    context: $.planPrompt.context,
    schema: ADVENTURE_PLAN_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
    // No `prompts` on the generating steps — see `respond.ts`
    // (culled 2026-09-16, R-12).
}))
    /* ── narrate ────────────────────────────────────────────────── */
    .task('sceneContext', ($) => C.buildSceneContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    plan: $.planWrite.json,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /**
     * The narrator's own transcript, ending on the NARRATOR's line.
     *
     * Its own node rather than the shared one, because the seed is a
     * name and this stage's name is not the session's speaker: built
     * against the planner's context the prompt ended `Verity:`, and the
     * scene came back as Verity in the first person however plainly the
     * instructions said to narrate. `build-scene-context@1` resolves
     * this stage as nobody, so `seedName` is the narrator's.
     */
    .task('sceneLines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.sceneContext.templateContext,
    seedName: $.sceneContext.seedName,
}))
    .task('scenePrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.sceneLines.messages,
    templateContext: $.sceneContext.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'sceneContext' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('scene'),
}))
    .oracle('scene', ($) => C.generateText.v1({
    context: $.scenePrompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}))
    /* ── voices ─────────────────────────────────────────────────── */
    /**
     * One generate per speaker the planner named, in parallel.
     *
     * The item is `{ name, intent }` as the planner wrote it, which is
     * what `core:task/build-side-character-context@1`'s `speaker` port
     * takes: a name and, when the cast carries one, their card. A name
     * the cast does not hold is still a legitimate turn — the builder
     * falls back to the name it was given, which is how a shopkeeper
     * nobody wrote a card for speaks.
     *
     * `max` is mandatory (F9) and is the only thing between a planner
     * that names the whole tavern and a turn that costs twenty calls.
     */
    .each('voices', {
    over: ($) => $.planWrite.items,
    max: MAX_SPEAKERS,
    mode: 'parallel',
}, (m) => m
    .task('context', ($) => C.buildSideCharacterContext.v1({
    cast: $.gather.cast.read.cast,
    // The planner's voice `{ name, character }`, on
    // the side-character fact port: a name the cast
    // holds resolves to that member, one it does
    // not is a genuine side character.
    sideCharacter: $.voices.item,
    // The same anchor the narrator gets: where this
    // is, who is here, and nobody else. A voice
    // built without it answered from whatever the
    // transcript suggested.
    state: $.gather.state.read.state,
    plan: $.planWrite.json,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.voices.item.context.templateContext,
    seedName: $.voices.item.context.seedName,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.voices.item.lines.messages,
    templateContext: $.voices.item.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({
        node: 'voices.item.context',
    }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('voices.item.say'),
}))
    .oracle('say', ($) => C.generateText.v1({
    context: $.voices.item.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
})))
    /* ── assemble ───────────────────────────────────────────────── */
    .task('voiceLines', ($) => C.joinText.v1({
    items: $.voices.values,
    params: slot.params(),
}))
    /**
     * The reply: the scene, then the voices.
     *
     * A nested literal is how one port takes two references, the same
     * construction `concat-candidates`' `sources` uses. `join-text`
     * drops what is empty, so a turn the planner gave nobody a voice in
     * is exactly the narrator's prose with no trailing separator.
     */
    .task('reply', ($) => C.joinText.v1({
    items: [{ text: $.scene.text }, { text: $.voiceLines.text }],
    params: slot.params(),
}))
    /** The reply row, filled — see `placeholder`. */
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.placeholder.messageId,
    text: $.reply.text,
}))
    /* ── keep state ─────────────────────────────────────────────── */
    /**
     * The state-keeper, and it runs LAST for a reason that is not taste.
     *
     * Every value and possession it produces is anchored to the newest
     * message in the session, which is how a swipe takes a turn's
     * changes back with it. Anchored to the player's message instead —
     * which is what running before the write would do — a regenerated
     * reply would leave its stat changes behind. `afterWrite` is the
     * edge that says so: the keeper reads a reply that EXISTS.
     */
    .task('keeperContext', ($) => C.buildKeeperContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    reply: $.reply.text,
    afterWrite: $.save.messageId,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('keeperPrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.keeperContext.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'keeperContext' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('keeperWrite'),
}))
    /**
     * `{ values, possessions }`, asked for as a shape.
     *
     * The stage this change exists for. Asked as an ordinary reply it
     * was a roleplay continuation that had just read the PLANNER's
     * document in the transcript, so it answered in the planner's schema
     * — `{beats, speakers, worldHints}` — which parses perfectly and
     * resolves to nothing. Two things stop that: the shape on the wire,
     * and a transcript with no documents in it for the model to imitate.
     *
     * Two lists rather than one two-armed list, because a schema can
     * only be strict about a list whose items are all one shape. The
     * preset's `path` names both, so what reaches the resolver is still
     * one list.
     */
    .oracle('keeperWrite', ($) => C.generateJson.v1({
    context: $.keeperPrompt.context,
    schema: ADVENTURE_KEEPER_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}))
    /**
     * Names into rows. A model has the names the transcript gave it and
     * no row ids; this is where "Verity" becomes a cast row and "hp"
     * becomes `core:slot/hp@1`, and where a name that is not in the
     * scene becomes a sentence on the receipt instead of a refusal.
     */
    .query('keeperResolve', ($) => C.resolveStateChanges.v1({
    changes: $.keeperWrite.items,
    /**
     * The planner's `worldHints`, resolved beside the keeper's
     * own list.
     *
     * The hints were a required part of the plan's schema and
     * were read by NOBODY: a first turn that said "the archive,
     * night, storm" left Location unset and the strip empty,
     * and the narrator was then asked to stay somewhere the
     * state had never heard of. A hint equal to what the world
     * already says proposes nothing, so the planner repeating
     * an unchanged state costs a turn nothing.
     */
    plan: $.planWrite.json,
    scope: $.input.sessionScope,
}))
    /**
     * Propose, or apply — the session's own decision, read from the
     * genre field rather than from a setting on the node.
     *
     * Two branches rather than one node with a computed parameter,
     * because `mode` is a parameter and a parameter is a value somebody
     * configured, not a value a run derives. The branch IS the decision,
     * the receipt records which predicate fired, and a person reading a
     * run can see that this turn applied because this session trusts the
     * narrator.
     */
    .junction('commit', { on: ($) => $.input.fields }, (r) => r
    .when('trusted', { path: 'trustNarrator', truthy: true }, (c) => c.task('apply', ($) => C.setState.v1({
    changes: $.keeperResolve.changes,
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .otherwise('reviewed', (c) => c.task('propose', ($) => C.setState.v1({
    changes: $.keeperResolve.changes,
    scope: $.input.sessionScope,
    params: slot.params(),
}))))
    /**
     * What the pipeline ships with, and the only place its authored
     * values live.
     *
     * Each is a *selection* a person can change in the panel rather
     * than a literal welded into the document, which is the whole
     * reason they are here and not inline on the nodes.
     *
     * ⚠ **A `path` has no declared default, so a preset value added
     * after an install has written its shipped config never lands**:
     * `ensureDefaultConfig` writes that row once, and the back-fill
     * behind it reads declarations rather than presets. Both selections
     * below resolved EMPTY on a live install for exactly that reason,
     * which is what `0122_adventure_config_reprojection` repairs.
     *
     * ⚠ **A sampling slot takes a seed identity, never an id.** The
     * one declared address a `sampling` slot has is the row reference
     * at the empty path, and its value is an integer
     * `sampling_configs.id`, a number an identity sequence assigns, so
     * it differs per install and no document can write one. The
     * spelling below names the ROW instead and `refDefaults` resolves
     * it at projection time, the same way a prompts or template
     * reference resolves.
     *
     * ⚠ **Still no per-stage token ceiling, and an author preset still
     * cannot ship one.** `.sampling('planWrite', { responseTokens: 300
     * })` writes an object where a row id is read: the executor finds
     * no config, the values resolve empty, and `context-budget` then
     * allocates against a window of zero. The executor's own
     * `resolveSlot` merges per-sampler overrides above a config and
     * would carry it; what is missing is a declared address for them to
     * live at. Until there is one, a stage is bounded by the sampling
     * config it points at, and the two JSON stages are bounded
     * structurally as well: a schema on the wire leaves a model nothing
     * to ramble in.
     */
    .preset('adventure', { label: 'Adventure', default: true }, (p) => p
    // Which list the voices map iterates, and which lists the
    // keeper's changes come from. Both differ from the
    // declared default (the whole document), so both have to
    // be a choice something made — and the keeper's names two
    // paths, which is how an answer split into arms reaches
    // one resolver as one list.
    .params('planWrite', { path: 'speakers' })
    .params('keeperWrite', { path: 'values,possessions' })
    // The one branch that writes rather than asks. The other
    // keeps the declared default, which is `propose`.
    .params('commit.trusted.apply', { mode: 'apply' })
    // Narrator first, then the voices, separated by a blank
    // line — the reply layout, as the one parameter it is.
    .params('reply', { separator: '\n\n' })
    // The two stages nobody reads run on Background, which
    // is the row that exists to say "this output is read by
    // the next node and by nobody else": low temperature, a
    // short window, no reasoning trace. The narrator and the
    // voices are deliberately absent: those are the prose a
    // person is waiting for, and they keep whatever the
    // session is set to.
    .sampling('planWrite', { seedKey: 'sampling-background' })
    .sampling('keeperWrite', {
    seedKey: 'sampling-background',
}))
    .build());
//# sourceMappingURL=adventure.js.map