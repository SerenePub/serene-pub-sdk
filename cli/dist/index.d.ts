/**
 * `@serene-pub/cli` — build-time tooling, kept out of the runtime package on purpose.
 *
 * Nothing here is importable by a running plugin, and that is the point: the packager
 * reads a plugin's source and decides what it is *allowed* to do. If a plugin could
 * import the thing that computes its own permissions, the manifest would stop being an
 * independent statement about the code (10 §10.2).
 */
export * from './compiler.js';
export * from './codegen.js';
export { hookBindingsFor, pluginEntrySource, entrySpecifier, type HookBinding, type HookDeclKind, type HookDeclLike, } from './pluginHooks.js';
export { typeSurfaces } from './typeSurfaces.js';
export { renderAnnouncementDocs } from './docs.js';
export type { DocPage } from './docs.js';
export { pipelineResolver, specGraphOf } from './docsGraph.js';
export { renderLawsDocs } from './docsLaws.js';
export { scaffoldConfig, scaffoldPlugin, scaffoldPreset, scaffoldValues, writeScaffoldedPlugin, ScaffoldError, type ScaffoldPluginOptions, type ScaffoldedFile, type TypeSurface, } from './scaffold.js';
export { renderExampleDocs } from './docsExamples.js';
export type { ComponentExample, Example, ExampleDocsOptions, ExampleGoldenReport, ExampleRunCtx, ExampleRunOptions, } from './docsExamples.js';
export { bundleComponent, type ComponentBundle } from './componentBundle.js';
export { cloneCoreComponent, listCloneable, driftReport, renderDrift, retrofitCloneBase, readCoreSource, coreSourceDir, untrustedReach, untrustedReachLines, importedPackages, CloneError, CLONE_BASE_FILE, } from './cloneComponent.js';
export type { RetrofitResult, CloneBase, CloneOptions, CloneRequest, CloneResult, CloneableComponent, CoreComponentSource, DriftEntry, FileChange, UntrustedReach, } from './cloneComponent.js';
//# sourceMappingURL=index.d.ts.map