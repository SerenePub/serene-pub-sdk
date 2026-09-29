/**
 * @serene-pub/core-catalog — core's announcement (24 §9).
 *
 * The genres, pipelines and hook declarations Serene Pub ships, as a
 * publishable package: SP core boot-seeds from it (the app's
 * `src/lib/server/pipelines/specs/*` are thin re-exports of this package),
 * conformance consumes it as fixtures, and modders import it for typed
 * references — `import { respond, chatGenre } from "@serene-pub/core-catalog"`.
 *
 * Moving the documents here is what makes core the first consumer of the
 * announce path rather than a special case: one validator, one document
 * shape, one hash discipline for core and plugins alike. The remaining
 * shipped prompts and the default preset ride the announcement too (T6b);
 * the shipped default configs stay derived (declarations + default author
 * preset + ref defaults) — there is no hand-authored config data to carry.
 */
import { type AnnouncementDocument, type CoverageReport, type Extension, type I18n } from '@serene-pub/sdk';
export * from './genres.js';
/**
 * The attribute slots core's genres bring.
 *
 * ⚠ A load-bearing re-export, on the same terms as `./entries.js` below:
 * declaring a slot REGISTERS it, and nothing imports these by value. Without
 * the module being reached, the Adventure genre would name seven declarations
 * that this process has never heard of.
 */
/** Core's catalogue of stat shapes — declared before the slots that name them. */
export * from './statShapes.js';
export * from './slots.js';
/**
 * Core's entry types (Part 1). Declaring one **registers** it, which is the
 * fact-about-the-code route node types take — so this re-export is what puts
 * them in `allDefinitions()` for the boot sync.
 *
 * ⚠ That makes this module the one in the package with a load-bearing side
 * effect, and the package says `sideEffects: false`. `./dist/entries.js` is
 * listed as the exception in package.json, because nothing imports these by
 * value: without it a bundler is entitled to drop the module, and a dropped
 * declaration is three missing registry rows with nothing to report them.
 */
export * from './entries.js';
export * from './prompts.js';
export * from './presets.js';
export * from './createChat.js';
export * from './guide.js';
export * from './adventure.js';
export * from './adventureActions.js';
export * from './lair.js';
export * from './lairActions.js';
export * from './writingRoom.js';
export * from './writingRoomActions.js';
export * from './whodunit.js';
export * from './whodunitActions.js';
export * from './answerForm.js';
export * from './respond.js';
export * from './turnOrder.js';
export * from './narrate.js';
export * from './narrateCharacter.js';
export * from './echo.js';
export * from './annexField.js';
export * from './builtins.js';
export * from './sprites.js';
export * from './toolLoop.js';
export * from './generateImage.js';
export * from './graphBuild.js';
export * from './summarize.js';
export * from './ui/sessions/widgets.js';
export * from './ui/sessions/looks.js';
export * from './ui/sessions/layouts.js';
/** @experimental */
export interface CoreSpec {
    slug: string;
    /** What a person calls the pipeline — a string or a locale map with `en` (R-20). */
    name: I18n;
    /**
     * Compiled lazily. Compiling resolves type pins against the registry, and
     * boot syncs that registry first — building at module scope would run the
     * compile before the sync, and before the conflict check that decides
     * whether these types mean what this build thinks they mean.
     */
    build: () => any;
}
/**
 * The pipelines core ships — one registry rather than a list of builders
 * beside a map of display names (two collections that had to agree). `name`
 * is what a person calls the thing; a list showing `core:spec/respond` is a
 * list of identifiers, not of things.
 * @experimental
 */
export declare const CORE_SPECS: CoreSpec[];
/** Lookup by slug, for a caller holding an id that wants the display name. @experimental */
export declare const coreSpec: (slug: string) => CoreSpec | undefined;
/**
 * Core's hook declarations (24 §11): identity, event, contract, ordering —
 * the referenceable half. Implementations live in SP core with their
 * capabilities (DB access, transactions) and bind to these ids at boot; the
 * boot completeness check refuses a declared hook with no implementation and
 * an implementation with no declaration.
 *
 * Empty today, deliberately: core's script *sites* are declared on the node
 * types in @serene-pub/contracts (`slots.scripts.accepts`), and core has no
 * in-process hook implementations yet. The first one added lands here and in
 * core's implementation registry in the same commit, or boot refuses.
 * @internal
 */
export declare const CORE_HOOK_DECLARATIONS: Record<string, {
    event: string;
    description?: unknown;
    before?: string[];
    after?: string[];
}>;
/**
 * The announcement — the whole package as one validated declaration (24 §6).
 * Compiled lazily for the same registry-sync reason as `CoreSpec.build`.
 * @experimental
 */
export declare function coreAnnouncement(): {
    document: AnnouncementDocument;
    coverage: CoverageReport;
};
/**
 * Core, declared the way any package declares itself — one `defineExtension`
 * call, every reference a value. Built on each call, never at module scope,
 * for the same registry-sync reason as `CoreSpec.build`.
 * @experimental
 */
export declare const coreExtension: () => Extension;
//# sourceMappingURL=index.d.ts.map