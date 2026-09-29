/**
 * The conformance kit (03 §9).
 *
 * This is the artifact SP Core upgrades *against*. The rest of this package is a
 * reference implementation whose runtime half is placeholder — a real executor will have
 * durable gate parking, a persistent run queue, transactions and four transports, none of
 * which are here. What survives the port is **the contracts**, and a contract nobody can
 * execute is a document.
 *
 * So: core implements `HostUnderTest`, runs `conform(host)`, and gets a pass/fail per
 * requirement with the law it comes from. The SDK's own executor runs the same kit, which
 * is what keeps the kit honest — a requirement the reference implementation cannot pass is
 * a requirement stated wrong.
 *
 * Every check states **what would be broken if it failed**, because a red line saying
 * "F13" tells an implementer nothing about what to go and look at.
 */
import type { SpecDocument } from '@serene-pub/sdk';
import type { Finding } from '@serene-pub/sdk';
import type { Receipt } from '@serene-pub/sdk';
import type { Bindings, RunOptions } from '@serene-pub/sdk';
import type { VenueListings } from '@serene-pub/sdk';
import type { GenreDecl, PresetDecl } from '@serene-pub/sdk';
import type { EventGraph } from '@serene-pub/sdk';
import { type Door } from '@serene-pub/sdk';
/**
 * The plugin grant table (plans/29 R-3), imported rather than restated.
 * `pluginHarness.ts` keeps it byte-for-byte with the two sandboxes' programs
 * and the app's `hookCtx.ts`, and its docblock says what a further copy would
 * be: the drift the install-time check exists to catch. C25 judges a host's
 * endowment against this one.
 */
import { type HookCtxKind } from '@serene-pub/sdk/testing';
import { type ComponentView } from './components.js';
import { type NodeHandler, type SwapEvidence } from './packages.js';
import type { Descriptor } from '@serene-pub/sdk';
export * from './components.js';
export * from './packages.js';
/**
 * One entry of a host's venue listing, as C19 reads it (F40): the action's
 * identity — its `key` and the id of the spec that contributed it, never the
 * declaration object, because a host decorates its entries — and, in the
 * composer, the slash name the host calls it by.
 * @experimental
 */
export interface ListedAction {
    key: string;
    /** The contributing spec's id: the document's `id` here, core's `specSlug`. */
    specId: string;
    /** The slash name the host lists the action under. Required of a composer entry. */
    slash?: string;
}
/** @experimental A built component module a host lists (C30, C31). */
export interface BuiltComponent {
    id: string;
    /** The built module's code. */
    code: string;
    /** The scopes the page grants it (`session:full`, …) when C31 mounts it. */
    grants?: string[];
    /**
     * The base sections its widget declares it reads (`WidgetDecl.reads`, R75)
     * — C31 mounts it with those and no others, as the page does, so a module
     * that reads a section it never declared fails here rather than on a
     * layout. Omitted: every base section, as a declaration without `reads`
     * gets. `componentsFromManifest` fills it from the package's widgets.
     */
    reads?: string[];
    /** The sections C31 mounts it with; `componentParitySections()` when omitted. */
    sections?: Record<string, unknown>;
    /**
     * The core component this module is a clone of (its manifest's
     * `components[].basedOn.component`). One based on `messages` brings C30's
     * parity half into play; with none, that half is not applicable.
     */
    basedOn?: string;
}
/** @experimental */
export interface HostUnderTest {
    name: string;
    validate(doc: SpecDocument): Finding[];
    run(doc: SpecDocument, opts: RunOptions): Promise<Receipt>;
    replay(doc: SpecDocument, receipt: Receipt, bindings: Bindings): Promise<Receipt>;
    /** Canonical form, for the round-trip law. */
    canonicalHash(doc: SpecDocument): string;
    importDocument(doc: SpecDocument): SpecDocument;
    /**
     * The host's own venue projection of the actions one document
     * contributes, for one channel (F40) — what its composer, message menu
     * and settings tabs render from. C19 judges THIS, entry by entry: the
     * SDK's executor implements it with `placeActions` over `actionsOf(doc)`,
     * each entry decorated with `slashNameOf`; core implements it with
     * `listSessionActions`'s placement (its `specSlug` is `specId` here).
     * Optional because a validator-only host has no listing — C19 then fails
     * naming the missing seam, rather than judging a rule the kit applied on
     * the host's behalf, which any host would pass (U7 review, C1).
     */
    listActions?(doc: SpecDocument, channel: string): VenueListings<ListedAction> | Promise<VenueListings<ListedAction>>;
    /**
     * What this host **ships**: the genres it offers in the picker and the
     * presets that fill their event slots. C24's law is about a catalogue
     * rather than a document — a genre that declares no `form-addressed` event
     * has nowhere to route an answer, and a preset that binds no pipeline to it
     * leaves every form it writes unanswerable — so it is read off what the
     * host ships and nowhere else. Optional: a host that ships no catalogue of
     * its own (a validator, a test harness) is not judged on it.
     */
    shipped?(): ShippedCatalogue | Promise<ShippedCatalogue>;
    /**
     * The **event map** this host draws for one genre, with each node's
     * termination policy — C29's evidence (PLAN-turn-order §B3). The graph is
     * the host's own (the app's `eventMap`), never one the kit derives, and a
     * termination policy is the host's statement of how a loop through that
     * node stops: auto-advance's cause rule and cap, or the run caps that park
     * a run tree for its owner. Optional: a host with no event dispatch has
     * no loops to judge.
     */
    eventMap?(genre: string): EventMapEvidence | Promise<EventMapEvidence>;
    /**
     * The BUILT component modules this host ships or has been handed — C30's
     * evidence for what a module may carry (§3.5).
     */
    components?(): BuiltComponent[] | Promise<BuiltComponent[]>;
    /**
     * Mount a built component module the way this host's page does — its
     * worker, its gate — in a **plugin's box** (never core's), with these
     * sections pushed and, when given, these scopes granted and only these
     * base sections read (`reads`, R75 — the page withholds every other base
     * section, as it does from a widget that declared them); show the kit the
     * result. C30 mounts its own fixture through it; C31 mounts every module
     * `components()` lists. The SDK harness takes both as they are
     * (`mountComponent({ …, grants, reads })`).
     */
    mountComponent?(code: string, sections: Record<string, unknown>, opts?: {
        grants?: string[];
        reads?: string[];
    }): Promise<ComponentView>;
    /**
     * This host's messages widget twice, over the same sections: its native
     * copy and a remote built from the same source (C30's parity half).
     * A package supplies it only when it ships a clone of core's messages
     * (`BuiltComponent.basedOn === 'messages'`); a package that lists its
     * components and ships no such clone has no pair to mirror, and the half
     * is recorded not applicable rather than skipped.
     */
    componentParity?(): Promise<{
        native: ComponentView;
        remote: ComponentView;
    }>;
    /**
     * The swaps offered to this host (R28/R29) — a package's manifest's
     * `swaps`, each with the declaration of the definition it seats
     * (`swapsFromManifest`). C32 fits each against `pinnedDefinition`; C33
     * probes each definition's handler.
     */
    swaps?(): SwapEvidence[] | Promise<SwapEvidence[]>;
    /**
     * The definition this host's own spec `spec` seats at `node` — its
     * compiled document's node, resolved in its own registry
     * (`pinnedDefinitionIn(coreSpec(spec)?.build(), node)` for core's).
     * Undefined when the host has no such spec or node.
     */
    pinnedDefinition?(spec: string, node: string): Descriptor | undefined | Promise<Descriptor | undefined>;
    /**
     * The handler this host would call for a definition id — a package's
     * bundle export, as `manifest.hooks.nodeHandlers` names it (C33).
     */
    nodeHandler?(definitionId: string): NodeHandler | undefined | Promise<NodeHandler | undefined>;
    /**
     * The binding probes' input for a definition whose in-ports the kit has
     * no sample for (`PROBE_SAMPLES`) — one value per in-port. C33.
     */
    probeInput?(definition: Descriptor): Record<string, unknown> | undefined;
    /**
     * The keys a **plugin** hook of this kind finds on its `ctx`, as this host
     * endows them — `Object.keys(ctx)` off the context the host builds, never a
     * list computed for the kit, for the same reason `listActions` is the
     * host's own projection: a list the kit derived would pass any host.
     *
     * `undefined` for a kind this host cannot dispatch leaves that kind
     * unjudged with the gap named; a host with no plugin surface at all omits
     * the seam, and C25 says which law went unchecked.
     */
    hookCtxKeys?(kind: HookCtxKind): readonly string[] | undefined | Promise<readonly string[] | undefined>;
    /**
     * How this host mounts a frame surface (20 §12). Optional; without it C26
     * names the gap rather than judging a boundary the kit cannot see.
     */
    frameMount?(): FrameMount | Promise<FrameMount>;
    /**
     * One entry per door this host has (01 §13). The kit feeds each
     * registered verdict's `failing(door)` input through it and expects
     * `judge(failing).sentence` back (the en text) somewhere in what the door
     * refused with; `null` if the door heard the input and did not refuse —
     * a failure, the rule is not heard there; `undefined` if this host's door
     * does not hear that verdict at all — a gap, named on the result (the
     * SDK's `registry` is `register()`, which never judges what a host can
     * run, so R-2's publication half is the app's to answer there). The entry
     * drives the host's REAL door — `validate` runs its validator on a
     * document built to hit the verdict, `run` runs the executor and answers
     * the receipt's halt or note, `registry` registers a declaration and
     * answers the throw — never the verdict itself, which any host would
     * pass. Optional; without it C27 names the seam, and a door left out is
     * named per verdict.
     */
    doors?: Partial<Record<Door, (verdictId: string, failing: unknown) => string | null | undefined | Promise<string | null | undefined>>>;
}
/** @experimental What a host ships, for C24's read of the form surface (R-15). */
export interface ShippedCatalogue {
    genres: readonly GenreDecl[];
    presets: readonly PresetDecl[];
}
/** @experimental C29's evidence: one genre's event map and the termination policy of each node that has one. */
export interface EventMapEvidence extends EventGraph {
    terminations: Readonly<Record<string, string>>;
}
/**
 * The two strings that decide what a frame document can reach, plus what the
 * host will listen to from inside one — C26's evidence.
 *
 * Declared by the host rather than inspected by the kit, because the mount
 * happens in a browser the kit is not in: core mounts its `<iframe>` in
 * `PluginFrame.svelte` and serves the document from `/plugin-ui`, and the
 * preview harness mounts the same attributes over a dev server. What the kit
 * can do is judge the pair, which is where every frame escape has come from.
 * @experimental
 */
export interface FrameMount {
    /** The iframe's `sandbox` attribute, verbatim — `allow-scripts`. */
    sandbox: string;
    /** The `Content-Security-Policy` the frame document is served under, verbatim. */
    csp: string;
    /**
     * The frame → host message kinds this host answers (`FrameHostMessage`'s
     * `t`). Optional; supplied, C26 holds it to "a frame proposes, the host
     * decides": an action-firing kind is among them and nothing that commits
     * is.
     */
    accepts?: readonly string[];
}
/** @experimental What a check may tell the runner besides pass or fail. */
export interface CheckReport {
    /**
     * A half of the requirement this host could not be judged on, and why.
     * Recorded on the result as `skipped`, never as a failure — for a gap in
     * the host's shape rather than a law broken: C18(b) on a host whose
     * `run` refuses a document `validate()` refuses (U7 review, W1).
     */
    skip(why: string): void;
    /**
     * Something the host should hear that is not a failure — an advisory
     * (C30's element scan: the runtime allowlist is the law). Recorded as
     * `notes`.
     */
    note(what: string): void;
    /**
     * A half of the requirement that does not apply to this host, and why —
     * not a hole in the host's shape (that is `skip`) and not a pass by
     * default: the law has nothing to judge here (C30's parity half on a
     * package that ships no clone of core's messages). Recorded as
     * `notApplicable`.
     */
    notApplicable(why: string): void;
}
/** @experimental */
export interface Requirement {
    id: string;
    law: string;
    title: string;
    /** What breaks in the product if this is not true. Written for whoever sees it go red. */
    consequence: string;
    check(host: HostUnderTest, fx: Fixtures, report: CheckReport): Promise<void> | void;
}
/**
 * The kit does not build specs itself — core's builder and the SDK's are the same code,
 * but a host may want to feed documents it produced another way. Fixtures are injected.
 * @experimental
 */
export interface Fixtures {
    /**
     * A minimal chat turn: input → query → task → provider → write, the write
     * opening the run's **live row** (`create-message` with `generating: true`
     * — F7, W1). C16 holds the host to naming that row; a complete message
     * would be an ordinary write, and a run with none names no live row.
     */
    chatTurn(): SpecDocument;
    /** The same, with a Task that halts before anything effectful. */
    haltsEarly(): SpecDocument;
    /** An async block with three chains, for the equivalence law. */
    gather(): SpecDocument;
    /** A map with a declared max. */
    mapped(): SpecDocument;
    /** A loop with a predicate inside its body. */
    looped(max: number): SpecDocument;
    /**
     * Two `create-message` placeholders (`generating: true`) in one document,
     * an oracle between them (F37). Two live rows, which `validate()`
     * refuses under F7 — that refusal IS the one-live-row law at publish
     * (a complete message beside them would be an ordinary write, W1), and C16(a) holds the host to it. Never run: the run
     * half of the law is proved on `chatTurn()`, a document the host can
     * publish (U7 review, W1).
     */
    twoWrites(): SpecDocument;
    /**
     * A document contributing actions (F40): at least one `quick`, one not,
     * one on a named channel, one whose `key` is a core verb's (a different
     * identity, never shadowing it — plans/31 V2). Every
     * one of them must be reachable from its venue's listing.
     */
    actions(): SpecDocument;
    /**
     * Documents that must be rejected, each paired with the law it violates.
     * The `F39` entries are also RUN, unvalidated, by C18(b) — the wiring that
     * asks for another node's setting must be handed nothing even when the
     * check was skipped. A host whose `run` refuses them is skipped on that
     * half, with the reason on the result (`CheckReport.skip`).
     */
    invalid(): Array<{
        law: string;
        doc: SpecDocument;
        because: string;
    }>;
    /**
     * A document with a **live-row** outlet inside a repeating clause (01 §4,
     * W1) — an `each` or loop body. One reply row per pass is N live rows;
     * other writes may repeat, and any write may sit in a gather or a
     * junction. Optional; without it C21 judges the two-live-rows half alone
     * and names the fixture it is missing.
     */
    writeInClause?(): SpecDocument;
    /**
     * A **parallel** gather whose chains each end in a write, the first chain
     * declared finishing LAST (a slow node before its write). C8 holds the
     * host to committing the writes in declaration order in both modes (01 §4,
     * W1b). Optional; without it C8 judges its results half alone and names
     * the fixture it is missing.
     */
    gatherWrites?(): SpecDocument;
    /**
     * A document contributing a `world` action in a venue the effects line
     * allows (`WORLD_ACTION_VENUES` — composer, message, session settings, admin,
     * review), and nothing else about it matters. C23 names that action's
     * function in a `choices` block, which is the shape a node can publish and
     * no document can be validated for. Optional; without it the block half is
     * not judged.
     */
    worldAction?(): SpecDocument;
    bindings(over?: Bindings): Bindings;
    world: RunOptions['world'];
    /**
     * How many writes the world has taken so far (F38), for a host whose
     * writes the kit cannot watch through `RunOptions.host` — a row count in a
     * test database, say. Optional: the kit's own probe covers a host that
     * routes `ctx.commit` to `RunOptions.host.commit`, and is read first — a
     * probe that saw the commit is never shadowed by a row count it kept from
     * moving. This is the fallback when the probe saw nothing; C16 and C17
     * name the gap when neither shows a write.
     */
    writesSeen?(): number | Promise<number>;
}
/** @experimental */
export declare class ConformanceError extends Error {
}
/** @experimental */
export declare const REQUIREMENTS: Requirement[];
/** @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle */
export interface ConformanceResult {
    id: string;
    law: string;
    title: string;
    pass: boolean;
    error?: string;
    consequence?: string;
    /**
     * The halves of the requirement this host could not be judged on, each
     * with why (`CheckReport.skip`). A pass with entries here is a pass with
     * a hole named — read them before calling the host conformant.
     */
    skipped?: string[];
    /** What the host should hear that is not a failure (`CheckReport.note`). */
    notes?: string[];
    /** The halves of the requirement that do not apply to this host, each with why (`CheckReport.notApplicable`). */
    notApplicable?: string[];
}
/**
 * The requirements a package's own declarations can fail, judged over its
 * BUILT artifact with no fixtures: what it ships (C28, C29), its component
 * modules (C30, C31), and its swaps (C32, C33). The rest judge a host's
 * executor, not a package.
 * @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle
 */
export declare const PACKAGE_REQUIREMENTS: readonly ['C28', 'C29', 'C30', 'C31', 'C32', 'C33'];
/**
 * `conform` over `PACKAGE_REQUIREMENTS` (or the subset `only` names) — a
 * plugin's test, carrying its artifact on the SDK's executor and harness.
 * These cases read no fixtures.
 * @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle
 */
export declare function conformPackage(host: HostUnderTest, only?: readonly string[]): Promise<ConformanceResult[]>;
/** @experimental */
export declare function conform(host: HostUnderTest, fx: Fixtures, opts?: {
    only?: readonly string[];
}): Promise<ConformanceResult[]>;
/** @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle */
export declare function renderConformance(results: ConformanceResult[]): string;
//# sourceMappingURL=index.d.ts.map