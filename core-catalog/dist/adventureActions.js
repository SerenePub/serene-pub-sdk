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
 * produces a ledger under the last message, not a new one. A pipeline is
 * allowed exactly one write-class Consumer (F7) and is not obliged to have one.
 *
 * ## Why `adventure-inventory` is not here
 *
 * The design lists a fourth action: a prose inventory check with no model call.
 * Two things say it should not be a pipeline. `core:query/session-state@1`
 * publishes possessions as a map keyed by owner, and no core node turns a map
 * into text — `join-text` reads a list. And the question it answers is the one
 * the **Inventory widget** answers continuously, in the session, with the item
 * prose on hover. A button that writes a worse copy of a panel already on
 * screen is a feature competing with itself.
 */
import { compile, slot, spec, sessionEvents } from "@serene-pub/sdk";
import * as C from "@serene-pub/contracts";
import { ADVENTURE_KEEPER_SCHEMA } from "./adventure.js";
import { adventureGenre } from "./genres.js";
/* ── look ───────────────────────────────────────────────────────────────── */
export const ADVENTURE_LOOK_SPEC_ID = "core:spec/adventure-look";
export const ADVENTURE_LOOK_VERSION = "1.0.0";
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
 */
export const adventureLookSpec = () => compile(spec(ADVENTURE_LOOK_SPEC_ID, {
    version: ADVENTURE_LOOK_VERSION,
    taxonomy: {
        zone: "session",
        role: "action",
        genre: adventureGenre.id
    },
    contributes: {
        triggers: [
            {
                genre: adventureGenre.id,
                function: "look",
                kind: "button",
                icon: "eye",
                i18n: { en: "Look" }
            }
        ]
    }
})
    .on("core:event/ui-action@1")
    .input("input", C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionAction
})
    .async("gather", { mode: "parallel" }, (b) => b
    .chain("history", (c) => c.query("read", ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params()
})))
    .chain("lore", (c) => c.query("read", ($) => C.lorebookTriggers.v1({
    scope: $.input.sessionScope,
    params: slot.params()
})))
    .chain("cast", (c) => c.query("read", ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain("state", (c) => c.query("read", ($) => C.sessionState.v1({ scope: $.input.sessionScope }))))
    .task("contextBudget", ($) => C.contextBudget.v1({
    sampling: slot.samplingOf("write"),
    params: slot.params()
}))
    .task("rank", ($) => C.rankHybrid.v1({
    candidates: $.gather.lore.read.main,
    budget: $.contextBudget.available,
    params: slot.params()
}))
    .task("context", ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    prompts: slot.prompts(),
    variables: slot.variables()
}))
    .task("lines", ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext,
    seedName: $.context.seedName
}))
    .task("prompt", ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: "context" }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf("write")
}))
    .provider("write", ($) => C.generateText.v1({
    context: $.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
    prompts: slot.prompts({ node: "context" })
}))
    .consume("save", ($) => C.createMessage.v1({ text: $.write.text }))
    .build());
/* ── the two keeper-only actions ────────────────────────────────────────── */
/**
 * Rest and Advance time are one graph with two sets of instructions, and saying
 * so in a builder is more honest than writing it twice.
 *
 * Both read the state, ask the keeper what changes, resolve the names it used
 * and land the result as proposals — or as writes, when the session trusts the
 * narrator. Neither writes a message: a clock tick is a ledger line, not a
 * paragraph, and the narrator has its own button for the paragraph.
 *
 * They are separate SPECS rather than one spec with a parameter because a
 * shipped prompt is resolved per (pool, spec): two specs is what gives Rest its
 * own instructions and Advance time its own, in the same pool, each editable
 * without touching the other.
 */
const keeperAction = (id, version, trigger) => compile(spec(id, {
    version,
    taxonomy: {
        zone: "session",
        role: "action",
        genre: adventureGenre.id
    },
    contributes: {
        triggers: [
            {
                genre: adventureGenre.id,
                function: trigger.function,
                kind: "button",
                icon: trigger.icon,
                i18n: { en: trigger.label }
            }
        ]
    }
})
    .on("core:event/ui-action@1")
    .input("input", C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionAction
})
    .async("gather", { mode: "parallel" }, (b) => b
    .chain("history", (c) => c.query("read", ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params()
})))
    .chain("cast", (c) => c.query("read", ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain("state", (c) => c.query("read", ($) => C.sessionState.v1({ scope: $.input.sessionScope }))))
    .task("contextBudget", ($) => C.contextBudget.v1({
    sampling: slot.samplingOf("write"),
    params: slot.params()
}))
    .task("context", ($) => C.buildKeeperContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables()
}))
    /**
     * Prose, and no turn to continue — the respond pipeline's
     * reasoning, applied to the two actions it left behind. A step
     * that is asking a question must not be handed a line with
     * somebody's name on the end of it, and must not be shown the
     * JSON an earlier turn left in the session.
     */
    .task("lines", ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext
}))
    .task("prompt", ($) => C.assemble.v2({
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: "context" }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf("write")
}))
    /**
     * The keeper's own shape, asked for as a shape.
     *
     * ⚠ **A moved pin**: asking for a document rather than parsing one
     * out of a prefilled reply moves both spec hashes, recorded in the
     * app's `boot/specHashes.test.ts`. Both slugs are new in this
     * release, which is what makes a moved pin a recorded change here
     * rather than a break.
     *
     * The respond pipeline's keeper schema, deliberately: a Rest
     * reporting in one shape and a turn reporting in another would
     * be two vocabularies for one ledger, and the resolver reads one.
     */
    .provider("write", ($) => C.generateJson.v1({
    context: $.prompt.context,
    schema: ADVENTURE_KEEPER_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
    prompts: slot.prompts({ node: "context" })
}))
    .query("resolve", ($) => C.resolveStateChanges.v1({
    changes: $.write.items,
    scope: $.input.sessionScope
}))
    .route("commit", { on: ($) => $.input.fields }, (r) => r
    .when("trusted", { path: "trustNarrator", truthy: true }, (c) => c.task("apply", ($) => C.setState.v1({
    changes: $.resolve.changes,
    scope: $.input.sessionScope,
    params: slot.params()
})))
    .otherwise("reviewed", (c) => c.task("propose", ($) => C.setState.v1({
    changes: $.resolve.changes,
    scope: $.input.sessionScope,
    params: slot.params()
}))))
    .preset("adventure", { label: "Adventure", default: true }, (p) => p
    // The keeper's two arms, joined into the one list
    // the resolver takes.
    .params("write", { path: "values,possessions" })
    .params("commit.trusted.apply", { mode: "apply" }))
    .build());
export const ADVENTURE_REST_SPEC_ID = "core:spec/adventure-rest";
export const ADVENTURE_REST_VERSION = "1.0.0";
/** Stop and recover: stamina and health back, and the clock moves on. */
export const adventureRestSpec = () => keeperAction(ADVENTURE_REST_SPEC_ID, ADVENTURE_REST_VERSION, {
    function: "rest",
    icon: "bed",
    label: "Rest"
});
export const ADVENTURE_ADVANCE_TIME_SPEC_ID = "core:spec/adventure-advance-time";
export const ADVENTURE_ADVANCE_TIME_VERSION = "1.0.0";
/** Let time pass: the world clock steps on, and the weather may turn with it. */
export const adventureAdvanceTimeSpec = () => keeperAction(ADVENTURE_ADVANCE_TIME_SPEC_ID, ADVENTURE_ADVANCE_TIME_VERSION, { function: "advance-time", icon: "clock", label: "Time passes" });
//# sourceMappingURL=adventureActions.js.map