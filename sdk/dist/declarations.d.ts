/**
 * The checks a package's declarations get, whichever surface declared them (D-1).
 *
 * A package says the same things in two places. `announce()` collects them as a
 * builder and compiles the announcement document; `defineExtension()` carries
 * them as literals the packager reads without executing the author's code. Both
 * are declaring one package, so both get **one set of checks** — the functions
 * here — rather than two that drift and answer the same mistake with two
 * different sentences.
 *
 * Every function returns findings rather than throwing, because the caller owns
 * the refusal: `announce()` collects them into an `AnnouncementError` with the
 * coverage report attached, `defineExtension()` into an `ExtensionError`, and
 * the packager into `CompileFinding`s with a file and a line. A thrown error
 * would let the first mistake hide the other nine.
 *
 * What is deliberately NOT here: the pipeline-namespace rule, which both
 * callers already enforce in their own words (one names the package namespace,
 * the other the plugin slug), and the identity display text, which only an
 * announcement has.
 */
import type { WidgetDecl } from './layout.js';
import type { AnnouncedSpec, ExternalRef, StoredEventDeclaration, ConfigDecl, CoverageReport, PresetDecl, PromptDecl } from './announce.js';
import { type ComponentDecl } from './extension.js';
import { type GenreDecl } from './genres.js';
import { type SurfacesDecl } from './surfaces.js';
import { type AnnexFieldDecl } from './annexFields.js';
/**
 * Everything a package declares, as either surface holds it. Every field
 * optional: a package that ships only pipelines and a package that ships only a
 * genre are both real, and the checks that need two of them say so themselves.
 * @experimental
 */
export interface DeclaredPackage {
    /** The namespace every declared id sits under — a package's `ns`, a plugin's `slug`. */
    ns: string;
    genres?: readonly GenreDecl[];
    pipelines?: readonly AnnouncedSpec[];
    prompts?: readonly PromptDecl[];
    configs?: readonly ConfigDecl[];
    presets?: readonly PresetDecl[];
    surfaces?: SurfacesDecl;
    components?: readonly ComponentDecl[];
    /** The widgets this package declares (R71). */
    widgets?: readonly WidgetDecl[];
    /** Definitions this package offers on another package's swappable nodes (R29). */
    swaps?: readonly (SwapContribution | StoredSwapContribution)[];
    /** Events this package declares, with who may record them. */
    events?: readonly StoredEventDeclaration[];
    /**
     * The package's annex declaration (owner ruling 2026-09-26): every key its
     * pipelines keep in its annex document. Undefined is "not stated here" —
     * the pass does not judge annex writes; `[]` declares nothing, so a
     * `set-session-annex` step naming a key is refused.
     */
    annexFields?: readonly AnnexFieldDecl[];
}
/**
 * One swap a package contributes (R29): its own definition, offered on a node
 * another package (usually core) exposes — `{ spec: chatTurnOrder, node:
 * 'decide.rules.strategy', definition: myStrategy }`. The spec is a value
 * — the spec you imported, or `use('<id>')` for one you cannot import.
 * With a value, the node key is checked here; the instance checks exposure and
 * port fit at install. Stored with ids (`StoredSwapContribution`).
 * @experimental
 */
export interface SwapContribution {
    /** The spec whose node this is offered on — never this package's own. */
    spec: AnnouncedSpec | ExternalRef;
    /** The node key, as the spec declares it. */
    node: string;
    /** The definition's pin. Stored as its id. */
    definition: {
        readonly id: string;
    };
}
/** A contribution as stored: ids throughout. @experimental */
export interface StoredSwapContribution {
    spec: string;
    node: string;
    definition: string;
}
/** The stored form of a contribution — the spec and the pin read down to their ids. @experimental */
export declare const storedSwap: (c: SwapContribution | StoredSwapContribution) => StoredSwapContribution;
/**
 * Swaps as authored: the spec is a value and the definition a pin. A
 * string is refused here, at the entry — the shared pass below also reads the
 * stored form, where both are rightly ids. With a spec value, the node key is
 * checked against the spec's nodes.
 * @experimental
 */
export declare function swapInputFindings(swaps: readonly SwapContribution[]): string[];
/**
 * Swap contributions (R29): a package offers only its own definitions, never
 * on its own specs (those list swaps on the node with `expose.swaps` — one
 * way to do each thing, R26), and each once.
 * @experimental
 */
export declare function swapContributionFindings(swaps: readonly (SwapContribution | StoredSwapContribution)[], ns: string, declaredSpecs: ReadonlyMap<string, unknown>): string[];
/** What one pass over a package's declarations produces. @experimental */
export interface DeclarationFindings {
    errors: string[];
    /** What is declared as written but draws otherwise — a layout over a widget's `maxInstances`. Never refuses. */
    warnings: string[];
    /** The preset coverage report and the `todo()` holes — useful even on a refusal. */
    coverage: CoverageReport;
    /** Ids referenced but not declared here; the instance enforces these at install. */
    requires: string[];
}
/**
 * The display text of one labelled declaration (R-20): `label` is required
 * — a config, a preset and a prompt are all listed by it — `description` is
 * not.
 * @experimental
 */
export declare function labelFindings(at: string, meta: {
    label?: unknown;
    description?: unknown;
}): string[];
/**
 * A package declares only its own genres. Referencing another's is done from a
 * spec's input binding, which is a reference rather than a claim of ownership.
 * @experimental
 */
export declare function genreOwnershipFindings(genres: readonly GenreDecl[], ns: string): string[];
/**
 * A compiled document's `expose.swaps` (R28), checked as the builder checks
 * them: known ids that do not fit are refused; ids this SDK does not know are
 * the instance's to check at install.
 * @experimental
 */
export declare function exposeSwapFindings(pipelines: readonly AnnouncedSpec[]): string[];
/**
 * The input lock (24 §4): a spec that answers a session event names the genre it
 * serves, and the event is one core declares or one this package namespaced.
 * A genre the package does not declare is recorded as a requirement.
 * @experimental
 */
export declare function inputLockFindings(pipelines: readonly AnnouncedSpec[], declaredGenres: ReadonlySet<string>, ns: string, requires: Set<string>): string[];
/**
 * The events an inlet lock answers: the one `event`, or the `events` list
 * (PLAN-turn-order §4.1) — as one list, so every reader of the lock asks
 * one question. Empty for a spec with no lock.
 * @experimental
 */
export declare function lockedEvents(input: {
    event?: string;
    events?: string[];
} | undefined): string[];
/** Does this lock answer `event` — as its one `event`, or one of its `events`? @experimental */
export declare const lockAnswers: (input: {
    event?: string;
    events?: string[];
} | undefined, event: string) => boolean;
/** Exactly one create pipeline per declared genre (24 §3). @experimental */
export declare function createPipelineFindings(genres: readonly GenreDecl[], pipelines: readonly AnnouncedSpec[]): string[];
/**
 * **A custom pipeline must include a default preset** (owner ruling,
 * 2026-10-02, notes 27/28). The Pipelines view is Genre → Preset →
 * pipelines, and a genre's pipelines are reached only through a session
 * preset: a package that declares a genre and no preset for it ships
 * pipelines nobody can start a session on or find under their genre. The
 * first preset a package declares for its genre is the one an instance makes
 * that genre's default when it has none (`registrySync`); a package that
 * contributes to another package's genre needs none of its own.
 * @experimental
 */
export declare function genrePresetFindings(genres: readonly GenreDecl[], presets: readonly PresetDecl[]): string[];
/**
 * Contributed actions (R-15, U5c): each declaration sound, and one slash name
 * meaning one function across the whole package — the per-document check cannot
 * see two specs of one package claiming `/acme.roll` for two different things,
 * so the package is the first place the collision rule runs across documents;
 * the install is the second.
 * @experimental
 */
export declare function contributedActionFindings(pipelines: readonly AnnouncedSpec[]): string[];
/**
 * Prompts: slugs unique per POOL, which is `(node type, slot)`.
 *
 * Uniqueness is per pool and not global: `summarize-scene-default` names a row
 * in the batch, synth and naming pools, and they are three different prompts
 * that happen to have been split out of one bundle.
 *
 * A prompt for a node this package does not announce is deliberately NOT
 * recorded as a requirement. It is the whole point of node scoping that a
 * package may ship prose for somebody else's node, and a node type is neither a
 * genre nor a spec slug — the only two shapes an instance can check. Listing one
 * would make every install fail permanently on a requirement nothing can ever
 * satisfy, where the real failure mode is mild and self-announcing: the row
 * seeds into a pool no installed pipeline offers, and is simply never shown.
 * @experimental
 */
export declare function promptFindings(prompts: readonly PromptDecl[]): string[];
/** Configs: node keys verified for declared specs; slugs unique per spec. @experimental */
export declare function configFindings(configs: readonly ConfigDecl[], declaredSpecs: ReadonlyMap<string, AnnouncedSpec>, requires: Set<string>): string[];
/** Presets: validated against the genre's event surface, with the coverage (24 §7). @experimental */
export declare function presetFindings(presets: readonly PresetDecl[], declaredGenres: ReadonlyMap<string, GenreDecl>, declaredSpecs: ReadonlyMap<string, AnnouncedSpec>, configs: readonly ConfigDecl[], requires: Set<string>): {
    errors: string[];
    coverage: CoverageReport['presets'];
};
/**
 * Surfaces: an entry that does not exist at install is a blank panel nobody can
 * debug, so the shape is checked where the author can still fix it. What is *at*
 * the path is the packager's business.
 * @experimental
 */
export declare function surfaceFindings(surfaces: SurfacesDecl | undefined): string[];
/** A component's slug: it names the built module (`components/<slug>.js`), so never a path. @experimental */
export declare const COMPONENT_SLUG: RegExp;
/**
 * Components (§3.5, R25): one slug, a label, a servable entry and a
 * framework SDK 1.0 ships. There is no mount point on the declaration — a
 * widget names the component, and that is where it mounts.
 * @experimental
 */
export declare function componentFindings(components: readonly ComponentDecl[]): string[];
/**
 * A package's widgets name its own components (R25): every genre panel with
 * a `component` must name a `ComponentDecl` this package declares — a plugin
 * cannot mount core's or another plugin's component by slug.
 * @experimental
 */
export declare function widgetComponentFindings(genres: readonly GenreDecl[], components: readonly ComponentDecl[]): string[];
/**
 * A package's widgets (R71): each names a component the package declares
 * (core's own widgets name core components — a plugin's cannot), and each id
 * is unique in the package, because the package's namespace plus the id is
 * the id every layout row keys on.
 * @experimental
 */
export declare function packageWidgetFindings(widgets: readonly WidgetDecl[], components: readonly ComponentDecl[]): string[];
/**
 * The layouts a package's genres ship, read as a whole package — what
 * `genre()` and `layout()` cannot see, since a layout names widgets by id and
 * only the package holds their declarations:
 *
 * - **The primary floor** (an error). A genre that withholds the
 *   conversation draws, in the layout it ships first, a widget of this
 *   package declared `role: 'primary'` — the one standing in the
 *   conversation's place. `genre()` asks only that the layout draws
 *   something. A widget of another package (a namespaced id) is that
 *   package's to declare, and is taken as written. Needs the package's
 *   widgets, so a package that states none is not judged.
 * - **What draws, but not as written** (warnings): every warning
 *   `validateSessionLayout` has for a shipped layout — an id placed but never
 *   drawn, two items on one cell, and one of the package's widgets placed
 *   more often than its `maxInstances`.
 * @experimental
 */
export declare function genreLayoutFindings(genres: readonly GenreDecl[], widgets: readonly WidgetDecl[] | undefined, ns: string): {
    errors: string[];
    warnings: string[];
};
/** Deliberate holes: `todo()` sentinels found in config values, with their paths (24 §7). @experimental */
export declare function todoHoles(configs: readonly ConfigDecl[]): CoverageReport['todos'];
/**
 * Every check above, over one package's declarations — what both authoring
 * surfaces run so that one mistake gets one sentence wherever it was written.
 * @experimental
 */
export declare function declarationFindings(p: DeclaredPackage): DeclarationFindings;
/**
 * The binding subjects a spec serves: its inlet lock's events, or — on
 * the action event — its actions' identities (`<spec slug>#<key>`).
 * @internal
 */
export declare const subjectsOf: (spec: AnnouncedSpec) => string[];
/**
 * A package's events: each under the package's namespace, declared for a
 * genre (once per genre), recordable by at least one subject or by any spec.
 * Every pipeline of this package that records one of them is locked to a
 * genre the event is declared for and serves a subject in that genre's
 * scope; a lock or a preset naming one uses a genre it is declared for. An
 * event under this package's namespace that `events` does not list is
 * refused — it has no scope. Another package's event is a requirement: its
 * scope is that package's, and the instance checks it.
 * @experimental
 */
export declare function eventDeclarationFindings(events: readonly StoredEventDeclaration[], ns: string, pipelines: readonly AnnouncedSpec[], declaredGenres: ReadonlyMap<string, unknown>, requires: Set<string>, presets?: readonly PresetDecl[]): string[];
/**
 * Every `set-session-annex` step of the package's pipelines writes only keys
 * its owner declares (owner ruling 2026-09-26) — the package's own
 * `annexFields`, or, for a step that names another owner, that owner's
 * declaration where this process knows it. Judged where the keys are
 * literal; a wired `value` is the host's to judge at the write.
 * @internal
 */
export declare function annexDeclarationFindings(ns: string, pipelines: readonly AnnouncedSpec[], fields: readonly AnnexFieldDecl[] | undefined): string[];
//# sourceMappingURL=declarations.d.ts.map