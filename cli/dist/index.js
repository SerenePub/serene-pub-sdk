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
export { hookBindingsFor, pluginEntrySource, entrySpecifier, } from './pluginHooks.js';
export { typeSurfaces } from './typeSurfaces.js';
export { renderAnnouncementDocs } from './docs.js';
export { pipelineResolver, specGraphOf } from './docsGraph.js';
export { renderLawsDocs } from './docsLaws.js';
export { scaffoldConfig, scaffoldPlugin, scaffoldPreset, scaffoldValues, writeScaffoldedPlugin, ScaffoldError, } from './scaffold.js';
export { renderExampleDocs } from './docsExamples.js';
export { bundleComponent } from './componentBundle.js';
export { cloneCoreComponent, listCloneable, driftReport, renderDrift, retrofitCloneBase, readCoreSource, coreSourceDir, untrustedReach, untrustedReachLines, importedPackages, CloneError, CLONE_BASE_FILE, } from './cloneComponent.js';
//# sourceMappingURL=index.js.map