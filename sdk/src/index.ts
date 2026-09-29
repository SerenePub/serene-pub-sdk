export * from './shapes.js'
export * from './candidates.js'
// Display text (R-20): the one `I18n` type, `i18nFindings` every publish door
// runs, and `i18nText` every reader resolves through.
export * from './i18n.js'
// One verdict per law (01 §13): `defineVerdict` / `verdicts()` and the five
// verdicts whose judges read only leaf vocabulary — the effects line and form
// staleness are declared in `messageBlocks.ts`, beside the primitives they
// call. On the barrel because a plugin author's own rules register through
// the same door, and the conformance kit (C27) enumerates what is registered.
export * from './verdicts.js'
export * from './descriptors.js'
// Handler input types, derived from the contract (ruling 2026-09-10). Beside
// descriptors because it is the same declaration read from the other end.
export * from './nodeInput.js'
export * from './refs.js'
export * from './media.js'
export * from './storage.js'
export * from './scope.js'
export * from './builder.js'
export * from './document.js'
export * from './connections.js'
export * from './registry.js'
export * from './dev.js'
export * from './validate.js'
export * from './config.js'
export * from './executor.js'
export * from './receipt.js'
export * from './review.js'
export * from './clauses.js'
// The one slot the substrate declares (R-9): `enabled` / `review` / a
// gather's `mode`. Beside review and clauses because it is their switches,
// declared.
export * from './settingsSlot.js'
export * from './messageBlocks.js'
// A reply's folded sections (B4): the port's checks, where a row keeps them,
// and the `core:section` part each becomes.
export * from './foldedSections.js'
export * from './promptBlocks.js'
export * from './facets.js'
export * from './template.js'
export * from './engines.js'
// Template ids — the owner-namespaced name a spec references a template row by,
// and the declaration a plugin ships one under (R19). Beside engines because the
// two share the `template` kind segment and must be read together.
export * from './templateIds.js'
export * from './variables.js'
// Bands as template variables (typed templates P2): a source declares the
// bands it publishes; `rendersAt` is what a node's variables slot renders.
export * from './bands.js'
// Typed templates P3: what a template slot can reference at one node, typed.
export * from './templateScopeAt.js'
// Typed templates P5: does a template fit the node that renders it — the
// selection refusal, law T1 and the packager's seed check share it. Takes the
// checker as a value, so the barrel stays dependency-free.
export * from './templateFit.js'
// Typed templates P4: what a Handlebars reference reaches at one point — the
// reading the checker (`/template-check`, which carries the engines) and a
// host's editor assist share. Dependency-free, so it stays on the barrel.
export * from './handlebarsReach.js'
// Attribute slots — the declared vocabulary stats and states are stored
// against. Beside variables because it is the same idea one layer down: a
// declaration a template reads through, rather than a shape a node emits.
export * from './attributes.js'
// A sheet — the named, ordered bundle of slots a genre or an owner carries.
// Beside attributes because it is the same registry discipline one level up:
// a slot says what one value is, a sheet says which values a thing has.
export * from './sheets.js'
// Stat shapes — the named FieldDecls a slot's value may take, and the story
// time a clock/date stat holds. Beside sheets: the same registry discipline,
// one level down (a sheet names slots, a slot names its shape).
export * from './statShapes.js'
export * from './storyTime.js'
// The turn lock — whether the numbers written for one speaker are still open.
// In the SDK because the host's write gate, a plugin proposing a change and
// the client drawing the ledger must answer it identically; see the file.
export * from './turnLock.js'
export * from './scripts.js'
export * from './wire.js'
export * from './preview.js'
export * from './migration.js'
export * from './extension.js'
export * from './identity.js'
export * from './events.js'
export * from './eventMapLaws.js'
export * from './rankingDecisions.js'
export * from './values.js'
export * from './genres.js'
export * from './announce.js'
// The checks both authoring surfaces run over what a package declares (D-1).
// After announce.js, because its declaration types are the ones these read.
export * from './declarations.js'
export * from './hooks.js'
export * from './settings.js'
export * from './sampling.js'
export * from './capabilities.js'
export * from './hookGrants.js'
export * from './pluginPermissions.js'
export * from './worldinfo.js'
// The widget envelope — the sections and verbs every session widget receives,
// native and frame alike. Before surfaces because the frame wire carries these
// shapes; `widgets.ts` imports nothing, so neither direction can cycle.
export * from './widgets.js'
// The person gate on a widget's invoke of a message-changing core verb — the
// page's and the harness's one table (imports nothing).
export * from './personGate.js'
// Annex fields (2026-09-26): a declared key a widget sets through core's one
// pipeline — no pipeline per value. Imports participants/settings/i18n only.
export * from './annexFields.js'
export * from './surfaces.js'
// The session layout document (v2) and the widget declarations it places.
// Beside surfaces because it is the other half of the same story: a surface is
// where a plugin renders, a layout is where that lands on screen. Imports only
// `settings.ts`, so `descriptors.ts` can name `WidgetDecl` without a cycle.
export * from './layout.js'
// What a component places and imports (§3.5): the host-element vocabulary the
// receiver enforces, and the import whitelist the compilers enforce.
export * from './hostElements.js'
export * from './componentBuild.js'
// The page's rules on top of that table — whose box it is, and the value
// judged being the value written — for the page's receiver and the harness.
export * from './receiverRules.js'
// …and the guard that applies them to a remote's records, record by record,
// for the page's receiver and the harness alike (Remote DOM's types only).
export * from './guardedConnection.js'
export * from './componentImports.js'
export * from './componentClient.js'
export * from './componentWire.js'
export * from './componentModule.js'
export * from './channels.js'
// Participant references — the audience grammar and the inlet's speaker
// (R-15, R-18 (3)); `Portrayal` is the resolver's answer the receipt pins.
export * from './participants.js'
// Turn order as state (PLAN-turn-order §4.2): the candidate, entry and order
// documents, `EMPTY_TURN_ORDER` and `readTurnOrder`. After participants
// because a candidate's `ref` is a participant reference.
export * from './turnOrder.js'
// The settings document (§4.12): what every run reads its session settings
// as. After turnOrder because it carries the order's state.
export * from './sessionSettings.js'
export * from './actions.js'
// The predicate core (U5e): `readPath` / `predicateHolds` the junction clause
// and an action's enabled-when both read, and the enabled-when evaluator the
// host and the client run against the same published-values document.
export * from './predicates.js'
export * from './status.js'
// On the barrel because core hashes these same declarations a second time, when
// it projects them into `pipeline_definition_registry` rows. Two answers to "is this
// the same content?" drifted apart once already — see `declarationMaterial` —
// and one shared strip is what keeps them together.
export * from './hash.js'
// ── D-4a: the pick hash ──────────────────────────────────────────────── start
// A DIFFERENT hash from the one above, and deliberately its own module: that one
// answers "is this the same declaration?", this one derives a session's chosen
// fact (a culprit, a secret entry) and is a stored answer in everything but
// name. Core's `core:task/pick-by-hash@1` binding and a plugin's own picker read
// the one implementation, so two readers of the same session cannot disagree.
export * from './pick.js'
// ── D-4a: the pick hash ────────────────────────────────────────────────── end
// The name rule (lair pass R7): one normalizer, so the undescribed-name check,
// a plugin's own check and the tests agree on when two names are one.
export * from './names.js'

// `/testing` is a separate entry point: an author's test-only imports should not be
// reachable from the runtime bundle (04 §2 — three scopes).
//
// `/tokenizers` is separate for the size reason rather than the scope one. It is
// the seam a HOST wires (registering the loaders for the eight ids that need a
// merge table); a pipeline author never touches it, and everything those loaders
// reach is the host's dependency tree, not this package's. Off the barrel, the
// executor's own `await import('./tokenizers.js')` stays a real split point —
// on it, every bundle that can see `run` would carry the registry.
export * from './widgetDecls.js'
