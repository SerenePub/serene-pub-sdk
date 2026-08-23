# 04 — `@serene-pub/sdk` (v3)

**Status:** Consolidated 2026-08-17. Folds in the four access levels, `bindProvider`, async
blocks and maps, halt, exports, libraries, and localization data.

**One sentence:** The SDK is a typed builder, test harness, and packager for pipeline *specs* —
it emits and validates the contract, it is never the contract and never a runtime (F6).

## 1. What it is / is not

**Is:** spec authoring with full type inference; type authoring (descriptors + bindings for all
five kinds); a local replay + golden harness built on receipts; a packager producing the
installable artifact and generating the manifest's permission list; versioning tooling;
conformance kits.

**Is not:** a runtime; a client API for driving SP remotely; required for making mods — the
in-app editor emits the same rows and documents.

**The clearest way to hold the whole thing:** the SDK is an *authoring* layer that compiles down to
formats SP already understands. Pipelines compile to documents; registrations compile to manifest
entries. SP imports the compiled output and never the source (§5a).

## 2. Package layout — four packages, three scopes, four access levels

### 2-0. What ships: four packages, because there are four clocks

**Implemented in `sdk-draft`.** The split is not cosmetic. One package would force a single
version number onto four things that move independently, and the one that hurts is `contracts`:
an author bumping the SDK to get a nicer builder would silently change **which SP release's types
they compile against**.

| package | who installs it | its version tracks |
|---|---|---|
| `@serene-pub/sdk` (+ `/testing`) | plugin authors | the authoring API |
| `@serene-pub/contracts` | plugin authors | **the SP release** — `0.6.x` compiles against SP 0.6.x |
| `@serene-pub/conformance` | SP Core, and any alternate host | the Fixed Ledger |
| `@serene-pub/cli` | plugin authors, build time only | the authoring API |

Two consequences worth stating. A plugin author never downloads the host conformance kit, because
it answers a question they are not asking. And **nothing in `@serene-pub/cli` is importable by a
running plugin** — the packager computes a plugin's permissions from its source, so a plugin that
could import the packager could argue with its own manifest.

The `shared` / `server` / `client` partition below is **orthogonal** to this split: it describes
sub-entry-points within `@serene-pub/sdk`, and it is *not yet implemented* in the draft. The draft
ships one shared entry point plus `/testing`. Scope enforcement at the bundler is 0.7 work, and it
is still the right design — recorded here so the two layouts are not mistaken for competing.

### 2-a. Binding names are derived from type ids, never chosen

**Implemented in `@serene-pub/cli`.** The exported name of a pinned type is the camelCase of its
id's name segment, and nothing else. `core:provider/generate-text@1` is `generateText`;
`chariot.recall:rank-semantic@1` is `rankSemantic`.

The rule exists because the alternative was discovered by writing it out: **eleven of thirty-five
hand-written names did not match their ids.** A generator with a hand-maintained alias table is a
generator that drifts, and the drift lands on plugin authors who imported a name that no longer
exists. `checkDerivable` runs in CI, so the moment a name stops being derivable it is a build
failure rather than a decision nobody notices making.

Renaming `core:provider/text-gen@1` to `core:provider/generate-text@1` also removed a collision
worth naming: it was the same string as `core:shape/text-gen@1` — the operation and the category
spelled identically in different namespaces.

The naming convention it enforces, stated once:

- **Shapes are nouns** — what a thing *is*. They double as connection kinds (F17), so they read as
  categories: `text-gen`, `embeddings`, `row-ids`, `allocated-context`.
- **Task / Provider / Consumer types are verb phrases** — they *do* something: `generate-text`,
  `embed-text`, `render-image`, `create-message`, `assemble`.
- **Query types name their source** — a Query is chosen by what it returns, which is what a user
  tuning "how much should lore matter" is looking at: `chat-history`, `persona-card`,
  `lorebook-triggers`.

### 2-b. One declaration per plugin: `defineExtension`

**Implemented in `@serene-pub/sdk`.** Hooks, settings, components and pipelines are tied together
in one call, validated where the author is rather than at install time on somebody else's machine:

```ts
export default defineExtension({
  slug: 'chariot.dice-tray',
  name: 'Dice Tray',
  version: '1.2.0',
  engines: { 'serene-pub': '>=0.7 <0.9' },
  settings,
  hooks: [pipelineHook(roll, rollHandler), lifecycleHook('startup', warm), eventHook('core:event/chat-created@1', seed)],
  components: [component({ surface: 'core:surface/chat-message@1', slug: 'dice-result', … })],
  pipelines: [dicePipeline],
})
```

Refused at the call site: a non-semver version, a duplicate component slug, and **a type declared
under a namespace the plugin does not own** — with the reason, which is that ownership is what
lets an update replace the right rows (12 §3b).

`bindingsOf(extension)` builds the executor's binding map *from the declaration*, so an author's
tests run their real hooks. A hand-maintained parallel map drifts, and the drift is only ever
discovered by a user.

## 2-c. Scopes and access levels

SvelteKit's server / shared / client partition is first-class structure. **Scoping enforces purity
at the bundler** (F11): pure Task handlers are legally *shared*; Query reads, Consumer commits and
Provider hosting are *server by construction* — a DB read slipped into a Task is a build failure,
not a review comment.

```
@serene-pub/sdk            SHARED (strictly isomorphic)
├── /spec        spec(), .on(), .input(), .query(), .task(), .provider(), .consume(),
│                .async(), .map(), .include(), $ref(), slot(),
│                validate(), canonical()
├── /contracts   generated core type declarations for every core:*@N   ← load-bearing
├── /types       DESCRIPTORS only: describeQueryType(), describeTaskType(),
│                describeProvider(), describeConsumerTarget(),
│                describeSurface(), describeEvent(), defineCapability(), defineEdgeShape()
├── /i18n        locale-map helpers for descriptor and manifest strings (§7)
└── /package     manifest schema + types

@serene-pub/sdk/server     SERVER-ONLY (node builtins; leaks fail the client build)
├── bindQueryType(descriptor, handler)
├── bindTaskType(descriptor, handler)        // shared-legal; server binding optional
├── bindConsumerTarget(descriptor, commit)
├── bindProvider(descriptor, handler)        // hostAgentAdapter asymmetry dissolved
│     ^ the four above are PIPELINE HOOKS; `public: true` in the descriptor
│       lets any spec pin the type, which is the whole peer-composition story
├── bindLifecycleHook(descriptor, handler)   // load/startup/shutdown/enable/disable/update/cron
├── bindEventHook(descriptor, handler)       // core event → callable; no Provider access (F32)
├── /testing     harness: run(), replay(receipt), golden(), diffReceipts(), conformance kits
└── /migrate     one-definition migrations, document executor

@serene-pub/sdk/client     CLIENT-ONLY
├── asSurface(SvelteComponent)               // → SurfaceBinding ABI
├── asSurfaceReact(Component) / asSurfaceVanilla(…)   // first-party adapters (10 §7)
├── ctx.rpc / ctx.events / ctx.state         // plugin:<id>:* channel + host scratch space
├── receipt/inspector widget points
└── (0.7+) SP region components for layout.root composition
```

**Access levels nest inside the scopes** (01 §12):
`sdk.<scope>.<visibility>.<owner>.<apiVersion>.<namespace>`.

- At import/initialization an extension declares its namespace, which **parameterizes the
  generated type surface**. Another plugin's private namespace never appears; your own public
  exports are not reachable under `private.<ownSlug>`. Enforced by generation, not review.
- **The declared namespace is a local alias.** Authority is core-side: the namespace attached to
  any call is dictated by which activated plugin owns the node or hook the call was made from.
  A plugin can be forked or renamed without editing source. **Except** an alias naming a
  different installed plugin's identity, which fails activation (09 §6).
- **Another plugin's namespace is a real address** — `public.<otherSlug>` must resolve against the
  activation registry and a dependency pin.
- **Vendored libraries inherit the host's identity.** A library bundled into two extensions has no
  runtime identity of its own, which is exactly why the permission generator must walk vendored
  code (09 §4).

`/contracts` is the pin system as a compile-time concept: each SP release publishes frozen
TypeScript declarations for every `core:*@N`. A spec compiled against a deprecated pin gets a
type-level strikethrough before the runtime receipt ever warns.

## 3. Descriptor / binding split

Every effectful type splits into a shared **descriptor** (id, version, shapes, config schema,
facet tags, slot declarations, connection kind, usage extractor, i18n strings, `earlyExit`,
`declaresRandomness`, `toggleable`) and a server **binding**.

Consequences: the client-side editor lists, configures and validates any installed type without
loading its server code; the plugin manager enumerates contributions from rows; surfaces get the
same split; the harness mocks by swapping a registry row.

## 4. The builder — chain → rows

**The chain names the kind at every step.** Reading a spec top to bottom shows the effect taxonomy
directly: what reads, what computes, what calls out, what writes.

```ts
export default spec('core:spec/chat-turn@1', { version: '1.0.0', mode: … })
  .on('core:event/user-message@1')                     // default subscription (§4b)
  .input   ('input',    UserMessageInput)
  .query   ('history',  chatHistory.v1({ … }))
  .task    ('merge',    mergeCandidates.v1({ … }))
  .provider('generate', generateText.v1({ … }))
  .consume ('save',     commitMessage.v1({ … }))
```

### 4a. Kind-named methods make laws compile errors instead of validator findings

This is the reason to prefer them over a generic `.step()`, and it is worth more than the
readability:

| Law | How the builder enforces it |
|---|---|
| Exactly one Input, positionally first (01 §2) | the chain starts in a state offering **only** `.input()`, and `.input()` is not offered afterwards |
| One primary **write** per spec (F7) | a second write-class `.consume()` is a type error; emit-class targets are unrestricted |
| Kind/type agreement | `.query()` accepts only a Query constructor — putting a Provider in a Query slot cannot compile |
| Purity by injection (F11) | `.task()` handlers are typed with no service parameter; impurity has nothing to reach for |
| No branching (F25) | the chain has no branch method to call |
| **No back-edges (F9)** | **the scope passed to each node contains only the nodes declared above it, so a forward reference has nothing to name** — 4d |

A generic `.step()` could catch none of these before the validator ran.

### 4a-i. References are scoped, not stringly typed

*Added 2026-08-18.* Every node method also accepts a **callback that receives the scope**:

```ts
.query('history', $ => chatHistory.v1({ scope: $.input.chatScope }))
.task ('prompt',  $ => assemble.v2({ candidates: $.history.messages }))
```

`$ref('history', 'messages')` still works and is still what the callback produces — this is
authoring sugar over an identical value, and the compiled rows, edges and canonical hash are
byte-identical either way (F3, F6). What changes is where mistakes surface:

| Mistake | Before | Now |
|---|---|---|
| mistyped node key | publish finding | compile error |
| mistyped port | publish finding | compile error |
| reference to a node declared **later** | publish finding | **cannot be written** — F9 at the call site |
| wrong kind for the method | authoring throw | compile error |

The third is the one that matters. `$` is accumulated as the chain is built, so it holds
exactly the nodes above the call and nothing below it. "No back-edges" stops being a rule
something checks and becomes a shape the language will not let you express.

Three details worth knowing:

- **A node accessor *is* a ref to `main`.** `$.history` and `$.history.messages` are both
  legal and mean what they look like. Refining twice (`$.a.b.c`) is refused with the reason:
  ports are flat.
- **Keys accumulate fully qualified, exactly as they land in the rows** (F21), and the
  scope expands the dots back into a path. A block's members, a map's members and an
  included fragment's members are therefore all in scope after the construct closes —
  `$.gather.semantic.vsearch.hits`, `$.summarize.item.sum.text`, `$.ctx.merge.candidates`.
  A block name alone is a **path**, not a ref: only the leaf is a node, which falls out of
  the key split rather than needing a rule. Inside a block chain a sibling may also be
  named by its short key (`$.embed`), and inside a map `$.$item` is the current item.
- **Config references take the accessor too** — `slot.connectionOf($.generate)` — so a node
  is never named twice in two different notations. Still not a data edge (F35).

### 4b. The four things it needs to stay honest

1. **Keys stay the first argument** (F21) — `.query('history', …)`, never a `key:` property that
   can be omitted and auto-filled. The whole point is that forgetting one is impossible, and a
   positional argument is harder to forget than a field.
2. **Node types stay imported pinned constructors** generated into `/contracts`. The method names
   the kind; the constructor names the *type and version*. Without it, pins stop being
   statically checkable and a deprecated pin no longer strikes through as you type.
3. **`.consume()` covers both write and emit.** Which one it is comes from the consumer target's
   descriptor, so the validator counts write-class ones (F7) and the review gate keys on declared
   effects (01 §7). One method, no author-facing distinction to get wrong.
4. **`.on()` declares a *default* subscription, not a fixed one.** Subscriptions live in the events
   registry as admin-managed rows (11 §2); the spec's declaration seeds one. An admin adding or
   removing subscriptions never edits the spec.

Constructs keep their own methods: `.async()`, `.map()`, `.include()`.

### 4c. Chain → rows

```ts
export default spec('chariot.fast-turn', { version: '1.2.0' })
  .input   ('input',      TurnInput)
  .query   ('history',    chatHistory.v1({ params: slot.params() }))
  .task    ('chunks',  $ => chunkText.v1({ text: $.history.messages, size: 2000 }))
  .map     ('summarize', { over: $ => $.chunks.items, max: 64, mode: 'parallel' }, m => m
    .provider('sum',   $ => generateText.v1({ text: $.$item, connection: slot.connection() })))
  .task    ('prompt',  $ => assemble.v2({
    history:   $.history.messages,
    summaries: $.summarize.item.sum.text,
  }))
  .provider('reply',      generateText.v1({ connection: slot.connection(),
                                            sampling:   slot.sampling() }))
  .consume ('save',    $ => commitMessage.v1({ text: $.reply.text }))
                       // core emits message-created; the node declares nothing (01 §8)
  .consume ('notify',  $ => emitSocket.v1({ from: $.save.messageId }))
```

*The string form — `$ref('history', 'messages')` — remains valid and compiles to the same
rows. It is the right form for a fragment or for generated specs, where the key is not a
literal at authoring time (4a-i).*

Rules, each mapping to a law:

- **Edges are data.** The linear chain carries the default edge; anything longer-range is an
  explicit `$ref('key','port')`. **Fan-in is legal; branching is not** (F25). Edges compile 1:1
  to `pipeline_edges` rows.
- **`.async()` and `.map()` are collect-and-continue constructs**, not kinds. Both declare
  `sequential | parallel`; maps declare a `max`. Neither may contain a write-class Consumer.
- **Nothing seals.** The chain may continue past a Consumer, and a Consumer's row ids are
  referenceable downstream (F7).
- **The spec is a value.** `validate()`, `canonical()`, `pack()`. Never callable.
- **Nodes cannot emit events** (F8). A node's only outward signal short of writing data is an
  emit-class `.consume()` on a namespaced socket handle. Core emits events for its own actions;
  subscribing is `.on()`.
- **End-to-end inference:** the Input schema types `$.input.…`; params check against pinned
  contracts; commit payloads check against the consumer target; `.on()` checks the event's payload
  shape against the Input contract.

## 4a. In-flight progress from a running node

A hook that takes a while — a large map, a long Provider call, a dependency download — can report
progress while it runs.

```ts
ctx.progress({ message: { en: 'Downloading runtime…' }, fraction: 0.4 })
ctx.log('info', 'chunk 12 of 64')
```

**Progress is ephemeral (F34).** It is delivered over the socket to whatever is watching and is
**never recorded in a receipt and never able to affect replay**. Same reasoning as chunk
boundaries in streaming (01 §11): a node whose behaviour or output depended on how progress was
reported would not be replayable, and receipts would flake. If something is worth keeping, it
belongs in the node's output, a notification, or the plugin's own data — not in the progress
channel.

Rules that keep it from becoming a nuisance:

- **Rate-limited per node**, on the same per-plugin channel limits as everything else
  (10-COMPONENTS §5). A chatty node is the default case, not the pathological one.
- **Messages are locale maps** (§7), like every other author-supplied string.
- **Attributed to the task, not the node, for non-admins.** A progress message naming a node key
  or type leaks the structure that 05 §0a deliberately hides. Core attributes; the plugin supplies
  text only.
- **Sidecars report progress as a `jsonrpc-stdio@1` notification** — the same place stream chunks
  live, or `runtime: process` hooks silently can't report and transport stops being a routing
  detail.
- **Pair it with cancellation in the UI.** A user watching a progress bar will look for a stop
  button; cancellation already exists and is executor-owned (01 §9a). Surfacing one without the
  other is the version of this that generates complaints.

## 5. Testing

- `run(spec, {input, mocks?, seed?})` — executes against the real executor with registry-row
  mocking. An explicit seed makes randomness reproducible in tests.
- `replay(receipt)` — deterministic; Provider outputs and the run seed come from the receipt
  verbatim (F16, F11), so replay-to-anywhere costs no inference.
- `golden(spec, fixtures)` / `diffReceipts(a, b)`.
- **Equivalence assertions** (F26, F16): forced-sequential vs parallel for every async block and
  map; recorded-stream-as-single-value vs streamed.
- Conformance kits (03 §9).

## 5a. The packager — compilation, and how the manifest gets written

The SDK is two things at once: **the API an author writes against**, and **the compilation tooling
that turns what they wrote into things SP can consume.** The second half is what makes the first
half safe to trust.

### What it compiles

- **JS-defined pipelines → spec documents. SP imports the document, never the JS.** The builder
  chain is an *authoring format only*: its sole job is to describe what the pipeline document will
  contain. It is not shipped to SP, not executed by SP, and SP has no concept of it — there is no
  code path in the importer that evaluates a builder chain, only one that parses documents.

  Three things follow, and they are the reason the authoring format can be as expressive as it
  likes without costing anything:
  - **F6 is structural, not a promise.** "The SDK is never a runtime" holds because the runtime
    never sees the SDK's output format — it sees a document.
  - **The in-app editor is genuinely equivalent.** Both paths converge on the same document and the
    same rows, which is what the round-trip law (01 §6) is asserting.
  - **A pipeline-bundle plugin needs no runtime at all.** It ships documents in the declared export
    directory; there is nothing to load.

  This is also what F27 rests on: the pipeline set is knowable before install because it was
  compiled ahead of time rather than announced at runtime.
- **Registrations → manifest entries.** Hooks *and their parameters*, UI components and entry
  points are all declared through SDK functions, so the compiler lists them into the manifest
  without the author maintaining a parallel document by hand. Recording parameters matters: SP can
  then validate a call against the manifest without loading the hook.
- **Observed SDK usage → the permission list.**

### What a released plugin actually contains

Only the compiled outputs — never the authoring source:

| | |
|---|---|
| Pipeline documents | for import; the builder chains that produced them do not ship |
| UI component files | static, per 10-COMPONENTS |
| Hook files | one per hook, carrying the custom code |
| Hook dependencies | whatever those hooks need to run — a Python script, a binary, vendored libraries |

**One file per hook is worth doing deliberately.** It makes loading granular (SP loads the hook it
is about to call, nothing else), failure granular (a broken hook file disables that hook, not the
plugin), and gives the manifest a concrete thing to point at rather than an offset into a bundle.

### Nothing is discovered at runtime, and nothing is discovered by executing

The compiler is run against a file or a tree of JS/TS. It **reads** what is registered — it does
not load and execute the author's modules to find out. Two consequences, and the second is a real
constraint on how authors write:

- **Packaging has no side effects.** `pack` never opens a socket, never hits a network, never runs
  someone's setup code. CI stays a build step rather than an execution surface.
- **⚠ Registrations must be statically analyzable.** Declared at top level, with literal
  arguments — never built in a loop, behind a conditional, or from a computed value. This is the
  constraint that makes the whole no-runtime-discovery model work, and it needs an SDK lint,
  because writing `for (const kind of kinds) bindTaskType(...)` is a natural thing to do and would
  silently produce an incomplete manifest.

| | Mechanism | Reliability |
|---|---|---|
| Node types, hooks and their parameters, components, entry points | **static extraction** of registrations | high — it is what the code says, verifiable by reading |
| Permission requirements | **static analysis** of call sites | partial; reliable for direct SDK imports, defeatable by dynamic access, prone to false negatives |

**Status in `sdk-draft`:** implemented as `compilePlugin` in `@serene-pub/cli`, with two halves
that cross-check each other. The static half counts registrations by scanning source; the dynamic
half reads the built `Extension`. **A count mismatch is an error** (`E_CONDITIONAL_REGISTRATION`),
which is how a hook hidden behind an `if` gets caught — the manifest would otherwise understate the
plugin, and an audit screen that understates is worse than none.

⚠ The scanner is currently a **dependency-free lexical scan**, not a parser: it blanks comments and
string bodies so a call written inside either cannot be mistaken for a real one, then matches
top-level calls and checks each argument is written out. It is correct for the shapes it
recognises and is the wrong long-term answer. Core should substitute a real TypeScript parser
behind the same `scanSource` signature; `compilePlugin` and every test above it are unaffected.

Evaluating the author's entry module is safe **in the CLI** in a way it is never safe in core: it
runs on the author's machine, on their own code. Core reads the output — a manifest plus documents,
both plain data — and decides installability with `checkInstall`, without executing anything (F6,
13 §10c).

Both land in the same file, so "the manifest is generated" reads as one guarantee when it is two
different things. Say which is which in the packager output. The runtime double-check (F28)
remains the actual boundary for permissions.

### The execution model this supports

When a pipeline runs, **SP core is the executor of every node** — nothing else sequences them
(F10). What differs is only how core reaches the implementation:

| What core invokes | Mechanism |
|---|---|
| A **core** node type or `public.core` API | in-process, direct call |
| An **extension** node type, `runtime: node` | in-process, direct async call, zero serialization |
| An **extension** node type, `runtime: process` | JSON-RPC over stdio, one hop |
| An **export** on another plugin | brokered by core, permission-checked, recorded |

**"Core makes a request to the extension" is the logical model, not the physical one.** For
in-process plugins it is a function call, not IPC — transport is a routing-table column (01 §9),
and reading "request" as "always out-of-process" would set the wrong performance expectations.

In every case **core sees the data in and the data out**, which is what makes budgets, receipts,
error normalization and cancellation uniform across a boundary whose interior is deliberately
opaque (01 §12.3).

## 6. `contrib/` — the in-tree dev flow

Post-0.6, a dev pulls SP source, adds a folder, and their pipeline appears in the app — riding
boot-time spec sync (02 §5).

- **Seam:** `contrib/<name>/` + one line in the barrel file.
- **Ids namespaced from day one** (`dool.dungeon:*`); registry rejects `core:` outside core dirs.
  **Repo location does not imply ownership** — `contrib/` gets `private.<theirSlug>`, never
  `private.core`.
- **Lint boundary:** importing SP internals *warns* — the honest label, "this line won't port."
- **0.7 lift-out:** copy folder → new repo → `npm i @serene-pub/sdk` → `pack --init` introspects
  registrations, scaffolds the manifest and generates the permission list. Goldens travel in the
  folder.
- **Contribution funnel:** the same seam has two exits — a good `contrib/` extension becomes a
  core PR by moving directories and re-namespacing.

## 6a. Dev loading — entry file, memory only, hot reload

**Implemented in `@serene-pub/sdk` (`devOverlay`, `reloadPlan`); ruled in 13 §11.**

A developer points core at an entry module. Core evaluates it *in the dev harness*, compiles it
with the same packager an installed plugin goes through, and registers the result as an in-memory
overlay: registry rows that shadow the persisted table for the session, compiled documents,
bindings and components. Nothing is written.

This is not an exception to F6 — see 13 §11 for the full reconciliation. The short form: **every
path into core carries a manifest and documents; dev mode changes where they were produced, not
what core receives.**

Reload is diff-driven. Handlers, components and newly added types swap immediately; a type whose
ports moved, a removed type and an edited pipeline wait for any run that is using them, and the
plan names the blocking runs so the developer sees *"waiting on 1 run"* instead of a reload that
looks like it did nothing.

The relationship to `contrib/` (§6) is worth stating: `contrib/` is for code that lives in the SP
tree and rides boot-time sync; dev loading is for a plugin that lives in its own repo and is not
installed at all. Same compilation, different residence, and neither is the install path.

## 7. Localization

Phase 1 is English-only with an `i18n` fallback structure in place, so adding locales later is
additive rather than a breaking change to every descriptor.

- Author-supplied strings — node titles and descriptions, settings labels, review field labels,
  event descriptions, notification text, component names — are declared as **locale maps** with a
  required `en` key, not bare strings.
- `/i18n` provides the helpers; a bare string is accepted and treated as `{ en: value }`.
- Resolution falls back `requested → en → key`.
- `ctx.locale` is provided to components; the same table is available to extensions via the SDK.
- **Recommended strategy for mods:** keep strings in one module per plugin, key by a stable id,
  never concatenate translated fragments, and let SP resolve — plugins should not ship their own
  i18n runtime.

## 8. Preview discipline (0.6)

- Exposed surface ruthlessly small — preview APIs freeze de facto regardless of changelog.
- Spec-document schema and receipt schema versioned from day one.
- `/contracts` marked experimental; lifecycle-family input contracts and the chat-message surface
  contract are the **hottest contracts in the system** — smallest and most carefully frozen.
- The incubation ledger is the promotion path, and it now has an address: `private.core`
  (01 §12).
