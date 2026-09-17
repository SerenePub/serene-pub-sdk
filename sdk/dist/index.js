export * from './shapes.js';
export * from './candidates.js';
export * from './descriptors.js';
// Handler input types, derived from the contract (ruling 2026-09-10). Beside
// descriptors because it is the same declaration read from the other end.
export * from './nodeInput.js';
export * from './refs.js';
export * from './media.js';
export * from './storage.js';
export * from './scope.js';
export * from './builder.js';
export * from './document.js';
export * from './connections.js';
export * from './registry.js';
export * from './dev.js';
export * from './validate.js';
export * from './config.js';
export * from './executor.js';
export * from './receipt.js';
export * from './review.js';
export * from './clauses.js';
// The one slot the substrate declares (R-9): `enabled` / `review` / a
// gather's `mode`. Beside review and clauses because it is their switches,
// declared.
export * from './settingsSlot.js';
export * from './messageBlocks.js';
export * from './promptBlocks.js';
export * from './facets.js';
export * from './template.js';
export * from './engines.js';
export * from './variables.js';
// Attribute slots — the declared vocabulary stats and states are stored
// against. Beside variables because it is the same idea one layer down: a
// declaration a template reads through, rather than a shape a node emits.
export * from './attributes.js';
export * from './scripts.js';
export * from './wire.js';
export * from './preview.js';
export * from './migration.js';
export * from './extension.js';
export * from './identity.js';
export * from './events.js';
export * from './values.js';
export * from './genres.js';
export * from './announce.js';
export * from './hooks.js';
export * from './settings.js';
export * from './sampling.js';
export * from './capabilities.js';
export * from './worldinfo.js';
export * from './surfaces.js';
export * from './channels.js';
// Participant references — the audience grammar and the inlet's speaker
// (R-15, R-18 (3)); `Portrayal` is the resolver's answer the receipt pins.
export * from './participants.js';
export * from './actions.js';
export * from './status.js';
// On the barrel because core hashes these same declarations a second time, when
// it projects them into `pipeline_definition_registry` rows. Two answers to "is this
// the same content?" drifted apart once already — see `declarationMaterial` —
// and one shared strip is what keeps them together.
export * from './hash.js';
// The old spellings of the 2026-09-16 rename, each marked @deprecated with its
// replacement. Scheduled for removal — see the file.
export * from './deprecated.js';
// `/testing` is a separate entry point: an author's test-only imports should not be
// reachable from the runtime bundle (04 §2 — three scopes).
//
// `/tokenizers` is separate for the size reason rather than the scope one. It is
// the seam a HOST wires (registering the loaders for the eight ids that need a
// merge table); a pipeline author never touches it, and everything those loaders
// reach is the host's dependency tree, not this package's. Off the barrel, the
// executor's own `await import('./tokenizers.js')` stays a real split point —
// on it, every bundle that can see `run` would carry the registry.
//# sourceMappingURL=index.js.map