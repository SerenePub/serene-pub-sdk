/**
 * The packager (04 §5a, U24b).
 *
 * Two halves, and the split is a law rather than a convenience:
 *
 * **Static.** Hooks, components, settings and permissions are extracted by walking the
 * TypeScript AST — *without executing the author's code*. "Hooks are never discovered at
 * runtime" (13/§30), so a registration built by a loop or a variable is a **lint error,
 * never a silent omission**. The manifest has to be a complete statement of what a plugin
 * can do, or the permission model is a guess and the audit screen is fiction.
 *
 * **Evaluated.** Pipelines are compiled by building the spec value and projecting it to a
 * document. That is allowed: F6 says *SP* never evaluates a builder chain — "no importer
 * path evaluates a builder chain" — not that the author's own build tool doesn't. SP
 * imports the document. This is where the document comes from.
 *
 * The line matters because it decides what an attacker can do. A malicious plugin can run
 * whatever it likes on the author's machine at build time; it cannot make SP run anything
 * at install time, because install reads documents and a manifest, both of which are data.
 *
 * **One artifact (D-1).** A package that declares a genre used to have to say so through
 * `announce()`, whose build emitted the genre and not the handlers; this one emitted the
 * handlers and not the genre. Since D-1 the extension carries both halves and this
 * packager emits one `manifest.json` carrying both — the announcement's declarations go in
 * the manifest rather than beside it, because the manifest is what an instance stores and
 * every reader it has reads that.
 */
import type { AnnexFieldDecl, Extension, I18n, LayoutPreset, VariableDecl, WidgetDecl } from '@serene-pub/sdk';
import type { SpecDocument } from '@serene-pub/sdk';
import type { ConfigDecl, CoverageReport, GenreDecl, PresetDecl, PromptDecl, StoredEventDeclaration, StoredSwapContribution, SurfacesDecl, TemplateSeed } from '@serene-pub/sdk';
import type { ManifestInput } from './sandbox.js';
import { type DefinitionSummary } from './codegen.js';
/** @experimental */
export interface CompileFinding {
    severity: 'error' | 'warning';
    file: string;
    line: number;
    code: string;
    message: string;
    /** Required on every error — a prohibition without an alternative is a bug (15 §1.3). */
    fix: string;
    /**
     * The definition id this finding is about, where it is about one.
     *
     * The lexical scan and the evaluated extension see most of the same
     * mistakes, and an author reading two sentences about one line stops
     * reading. `compilePlugin` drops the scan's copy of anything the
     * evaluated half says more precisely, and this is the key it matches on.
     */
    id?: string;
}
/**
 * One source file as the packager reads it.
 *
 * `permissions: false` marks a file that is **not the plugin**: a test, an
 * example, a fixture's stand-in host. Nothing the packager says *about the
 * plugin* is read out of it — not a permission, not a declaration count, not a
 * sandbox-endowment refusal — because every one of those is a statement about
 * what the shipped package can do, and a stand-in is written precisely to do
 * what the package cannot.
 *
 * Both halves of that were incidents, a day apart. `check .` answering
 * `core:write · provider:call` off `examples/fixtures.ts` taught an author to
 * ignore the one list the consent screen is built from. Then a plugin's test
 * file looping `for (const handler of […]) await handler(…)` was counted as
 * eleven handler registrations against the extension's ten, and the package
 * stopped building.
 *
 * ⏳ The field is still called `permissions` because two lanes read it by that
 * name while this widened; it now gates more than permissions, and the rename
 * is a follow-up rather than a surprise mid-flight.
 * @internal
 */
export interface SourceFile {
    path: string;
    text: string;
    permissions?: boolean;
}
/**
 * Paths that are not the plugin, absent any `--ignore`.
 *
 * Deliberately *not* skipped outright: a `fetch()` in a test file is still a
 * `fetch()` in the package, and a rule that fired only outside `test/` would
 * be a rule an author could move a file to escape. `--ignore <glob>` is the
 * blunt instrument; this list is the narrow one.
 * @experimental
 */
export declare const DEFAULT_PERMISSION_IGNORES: readonly ['**/*.test.ts', '**/test/**', '**/tests/**', '**/examples/**', '**/fixtures/**'];
/**
 * A glob over a package-relative path: `**` crosses directories, `*` does not,
 * `?` is one non-separator character. Small on purpose — the packager has no
 * dependencies, and a matcher an author has to read the semantics of is worse
 * than one whose whole definition fits on a screen.
 * @internal
 */
export declare function matchesGlob(pattern: string, path: string): boolean;
/** @experimental */
export interface Manifest {
    schemaVersion: 1;
    slug: string;
    /** What the plugin is called where it is listed — a string or a locale map with `en` (R-20). */
    name: I18n;
    version: string;
    description?: I18n;
    /**
     * The Serene Pub range this plugin supports, npm-style —
     * `{ 'serene-pub': '>=0.7 <0.8' }`. Version ranges only (R1); template
     * engines are `templateEngines`.
     */
    engines?: {
        'serene-pub'?: string;
    };
    /**
     * Template engines this plugin ships — `{ '<engine id>': '<hook name>' }`,
     * e.g. `{ 'acme.x:template/mustache@1': 'renderMustache' }`. The host
     * registers a forwarding renderer per entry that calls the named bundle
     * export in the sandbox. Absent when the plugin ships none.
     */
    templateEngines?: Record<string, string>;
    /**
     * Node definitions this plugin registers — summarized for the audit screen
     * (10 §10.2), each carrying the declaration an instance registers it from
     * (`DefinitionSummary.declaration`, D-6b).
     */
    nodeDefinitions: DefinitionSummary[];
    /** The three extension callables (R-1): handlers, lifecycle callbacks, event listeners. */
    hooks: {
        handlers: Array<{
            definitionId: string;
            visibility: 'private' | 'public';
            runtime: 'process';
        }>;
        lifecycleCallbacks: Array<{
            moment: string;
        }>;
        /**
         * Each subscription with the **exported function that answers it**
         * (D-6b). A host dispatching an occurrence calls a hook by name, and
         * an entry naming only the event left it guessing — so core refused
         * the subscription rather than guess, and a packaged listener never
         * ran. `hook` is the app-runtime spelling, the same key an
         * `eventHooks: [{ event, hook }]` declaration uses.
         */
        eventListeners: Array<{
            event: string;
            hook: string;
            timeoutMs?: number;
        }>;
        /**
         * Which exported function implements each node definition, by pin —
         * `{ '<definitionId>@<version>': hookName }` (D-6b).
         *
         * A map rather than a field on `handlers` above because that is the
         * shape every reader has: core's node bindings, the conformance
         * probe and the app-runtime `hookKinds` / `templateEngines` declarations all
         * ask "which hook implements this id", and the answer is a lookup.
         * The names are the bundle's own exports — one derivation
         * (`pluginHooks.ts`) writes both, so the manifest cannot name a hook
         * the bundle does not export.
         */
        nodeHandlers: Record<string, string>;
    };
    /** Components (§3.5, R25): a widget names one by slug; it runs in the page's UI worker. */
    components: Array<{
        slug: string;
        label: unknown;
        framework: string;
        entry: string;
        settings?: Record<string, unknown>;
        basedOn?: {
            component: string;
            version: string;
            sourceHash?: string;
        };
        /** The declared source; `entry` is the BUILT module once `build` ran (C3). */
        source?: string;
        /** Third-party packages the build inlined into the module. */
        bundled?: string[];
        /**
         * The host contract the built module assumes (F1) — widget protocol,
         * host-element vocabulary, and the SDK / component-client versions —
         * written by `build`. A host refuses a component whose protocol it does
         * not speak or whose vocabulary major it lacks
         * (`componentBuiltAgainstFinding`); absent = built before the record.
         */
        builtAgainst?: import('@serene-pub/sdk').ComponentBuiltAgainst;
    }>;
    settings?: Record<string, unknown>;
    /** Pipelines shipped, by identity — the documents travel beside the manifest. */
    pipelines: Array<{
        id: string;
        version: string;
        nodes: number;
        presets: string[];
    }>;
    /**
     * Template rows shipped (R19), **verbatim** rather than summarized.
     *
     * The pipelines above are summarized because their documents travel beside the
     * manifest as their own files; a template is a handful of fields and has no second
     * file, so the manifest is where it travels. The instance projects these into rows
     * on enable, which is the same shape a `preset()` declaration already has.
     */
    templates?: TemplateSeed[];
    /**
     * **Compiled from usage** wherever usage can say it. An author cannot over-request,
     * and cannot under-declare either — the audit screen shows what the code can
     * actually reach.
     *
     * The two exceptions are declared, because no call site carries them: a storage
     * quota is a number and a network host is a name. They land here in the same flat
     * taxonomy as the rest — `storage:<bytes>`, `network:<host>` — so an instance reads
     * one list and an administrator denies one entry at a time. A declaration can only
     * add: nothing an author writes removes what the scan found.
     */
    permissions: string[];
    peerTypes: string[];
    /**
     * The genres, surfaces, presets, configs and prompts this package declares —
     * the half that used to be sayable only through `announce()`, and so only
     * emittable by the other build path.
     *
     * They travel **in the manifest** rather than in a document beside it because
     * every reader an instance has already reads the manifest: `surfacesOf` takes
     * `manifest.surfaces`, `requirementsOf` takes `manifest.requires`, the
     * permission model takes `manifest.permissions`, the plugin list takes
     * `manifest.name`. A second file would need a second install step that nothing
     * implements, and the two would drift the first time one was written without
     * the other.
     *
     * All optional, so a package that declares none of them emits exactly the
     * manifest it emitted before.
     */
    genres?: GenreDecl[];
    /** The widgets this package offers (R71), ids local — the instance puts them under the package. */
    widgets?: WidgetDecl[];
    /** Annex fields this package offers every session it is on (`annexField()`); the owner is the package slug. @experimental */
    annexFields?: AnnexFieldDecl[];
    /**
     * The context variables this package declares — its `variables` list and
     * every variable its definitions' bands hold (`variablesOf`), verbatim:
     * id, i18n, description, scope, sample. An instance registers them from
     * the stored manifest before the package's definitions and specs, so a
     * band's variable is known where its template is checked (typed templates,
     * 2026-09-27). Own namespace only. Omitted when there are none.
     * @experimental
     */
    variables?: VariableDecl[];
    /**
     * The layouts this package's genres ship (R71), one entry per layout with
     * its genre, the package's own widget ids already under its namespace — the
     * shape the instance's layout reconciler reads.
     */
    layouts?: Array<{
        genreId: string;
        slug: string;
        name: unknown;
        description?: unknown;
        preset: LayoutPreset;
    }>;
    surfaces?: SurfacesDecl;
    presets?: PresetDecl[];
    configs?: ConfigDecl[];
    prompts?: PromptDecl[];
    /**
     * This plugin's definitions offered on other packages' swappable nodes
     * (R29), definitions as ids. The instance checks the node and the fit at
     * install and lists enabled contributions after the node's own swaps.
     */
    swaps?: StoredSwapContribution[];
    /**
     * Events this plugin declares, with who may record them (R52). The
     * instance registers each and holds recordings to its scope.
     */
    events?: StoredEventDeclaration[];
    /** Ids referenced but not declared here — the instance enforces these at install. */
    requires?: string[];
}
/** @experimental */
export interface CompileResult {
    manifest?: Manifest;
    documents: SpecDocument[];
    findings: CompileFinding[];
    ok: boolean;
    /**
     * The preset coverage — which of each genre's event slots this package fills,
     * and the `todo()` holes it left. Present whenever the package declares
     * presets or configs, so `serene-pub build` can print for a unified package
     * what the announce path has always printed.
     */
    coverage?: CoverageReport;
}
/** @internal */
export interface StaticScan {
    findings: CompileFinding[];
    permissions: string[];
    /**
     * The executor-only `ctx` members the source reaches — `read`, `call`,
     * `commit`. Kept beside the findings so the evaluated half does not say the
     * same thing again at a worse address: a handler's `Function.toString()`
     * knows which definition it belongs to, the source knows the line.
     */
    endowments: string[];
    /** Declaration call sites found, for cross-checking against the evaluated module. */
    declared: {
        extensions: number;
        handlers: number;
        lifecycleCallbacks: number;
        eventListeners: number;
        components: number;
    };
}
/**
 * Walk source text. **Never evaluates.**
 *
 * ⚠ This is a lexical scanner, not a parser. It is dependency-free and version-stable,
 * which is right for a draft, and it will miss things a real AST would catch — an
 * identifier named `component` used for something else, for one. **Core should swap in a
 * proper parser**; the interface is the part that matters, and the findings it produces
 * are the contract.
 * @internal
 */
export declare function scanSource(files: readonly SourceFile[]): StaticScan;
/**
 * What core refuses in a frame document, read where the author still is.
 *
 * A frame is mounted in an opaque-origin iframe with `sandbox="allow-scripts"`
 * and served under `script-src 'self'`. Both refusals are **silent** at
 * runtime: an inline script never runs, a form submit never fires, and the
 * surface simply sits there. That is the whole reason this check exists — a
 * mistake that shouts does not need a packager to catch it.
 *
 * ⚠ Lexical, like the source scan: tags are matched with a regular
 * expression, not parsed. A document that hides a `<form>` from this will
 * still be refused by the browser, which is the harder audience.
 * @internal
 */
export declare function scanFrameDocument(doc: {
    path: string;
    text: string;
}): CompileFinding[];
/** @internal The documents a `surfaces` declaration names, in declaration order. */
export declare function declaredFrameEntries(surfaces: SurfacesDecl | undefined): string[];
/**
 * The same list, read lexically out of the source — what `check` has, since it
 * never evaluates the author's module.
 *
 * Every package-relative document the source names, not only the ones written
 * at an `entry:` key: Battleship names both of its surfaces through a
 * `const SESSION_VIEW_ENTRY = 'ui/session.html'`, which is the ordinary way to
 * write it and would otherwise be read by `build` and not by `check`. A URL
 * and an absolute path are somebody else's document and are left alone; a
 * `.html` this package ships and does not mount is scanned anyway, and if that
 * is wrong for a package, `--ignore` says so.
 * @internal
 */
export declare function frameEntriesIn(files: readonly SourceFile[]): string[];
/** @experimental */
export interface CompileInput {
    /** Source files, for the static half. */
    sources: SourceFile[];
    /**
     * The frame documents the package declares, already read.
     *
     * Passed in rather than read here because nothing in this file touches a
     * filesystem — the packager is a pure function from text to findings, which
     * is what lets a test state a document in three lines. The command line
     * resolves `surfaces` to paths and reads them.
     */
    frameDocuments?: Array<{
        path: string;
        text: string;
    }>;
    /** The evaluated extension, for the pipeline half. */
    extension?: Extension;
    /**
     * A separate sandbox manifest, for a package that has not moved its
     * permissions onto the extension (`ExtensionDecl.permissions`). Its declared
     * `storage` and `network` fold into the compiled list exactly as the
     * extension's own would; the two are a union, so a package part-way through
     * the move loses nothing. Its `hooks`, `components` and `pipelines` lists are
     * not read — those come from the extension, which is the statement the
     * packager can cross-check against the source.
     */
    manifest?: ManifestInput;
}
/**
 * Produce the manifest and the pipeline documents.
 *
 * Cross-checks the two halves against each other: if the AST found three hooks and the
 * evaluated module exposes two, something is being registered conditionally, and the
 * manifest would understate what the plugin can do.
 * @experimental
 */
export declare function compilePlugin(input: CompileInput): CompileResult;
/**
 * The layouts a package's genres ship, as manifest entries (R71): the
 * package's own widgets named under its namespace (`<slug>:<id>`), instance
 * keys and per-instance maps with them, and everyone else's ids as written.
 * @internal
 */
export declare function genreLayouts(e: Extension): NonNullable<Manifest['layouts']>;
/** @experimental */
export declare function renderFindings(findings: CompileFinding[]): string;
/**
 * The install-time counterpart to "permissions are compiled from usage": what a plugin
 * says it *cannot* do. Generated, so it cannot flatter (U32).
 * @experimental
 */
export declare function cannotDo(m: Manifest): string[];
//# sourceMappingURL=compiler.d.ts.map