# Serene Pub Pipeline — Constitution (v3)

**Status:** Consolidated. Supersedes v2 (2026-08-15) and folds in every decision from the
2026-08-17 review pass (formerly 09-AMENDMENTS-A). Once accepted, every 0.6+ plan is reviewed
against this document. Changes to §2–§11 and the Fixed Ledger (§14) require the amendment
process in §13.

**One-paragraph summary:** A pipeline is a versioned *spec* stored as normalized rows and
projected as a document. It describes a **linear** order of typed nodes. Five node kinds — an
effect taxonomy, not a feature list — cover everything: Input, Query, Task, Provider, Consumer.
Kinds are closed; *types within kinds* are an open registry. All control flow lives in SP core's
executor; extensions expose bindings the executor calls. Writes are policy-governed and
user-gateable, runs are budgeted by consumption, and every run emits a receipt of recorded
decisions. Core's own features are specs and registered types in this same system, which is what
makes the contract trustworthy: core cannot break the contract without breaking itself first.

---

## 1. Vocabulary (normative)

| Term | Meaning |
|---|---|
| **Spec** | A versioned pipeline definition. Rows are the system of record (§6); the document is its deterministic projection. |
| **Kind** | One of the five closed effect classes: Input, Query, Task, Provider, Consumer. |
| **Type** | A registered, versioned entry within a kind (`namespace:name@N`). Open registry. |
| **Descriptor** | The shared-scope declaration of a type: id, version, config schema, ports, shapes, facet tags, slot declarations. What specs pin against and editors render. |
| **Hook** | Any extension callable core invokes. Three kinds, each with its own rules — §9. Never used loosely; always qualified. |
| **Pipeline hook** | The callable implementing a node type. Data in, expected shape out; the executor is the only caller. **Private** = only the owning extension's specs may pin it. **Public** = any spec may. |
| **Lifecycle hook** | Core-invoked at defined moments: load, startup, shutdown, enable, disable, update, sidecar spawn, and scheduled cadences. Never public. |
| **Event hook** | An extension callable registered against a core event (chat created, message created, character updated…). Runs outside the run model — §9c. |
| **Pin** | A spec's reference to an exact type version. Statically checkable at load and at build. |
| **Shape** | A versioned edge/payload contract (`core:shape/text-gen@1`). Shared shapes make types swappable. |
| **Halt** | A node result meaning "stop, and that is correct." Distinct from an error (§5). |
| **Async block** | A spec-level declaration that several chains run concurrently and are awaited together (§4). Not a kind. Outputs `core:shape/branch-results@1` — an ordered list, one entry per branch, in **declaration order**, each carrying `branchKey`, `index` and the discriminated result. Never a merged object: merging needs a field-collision policy and every such policy is wrong for somebody. Same shape **map** produces, so one equivalence harness covers both (F26). |
| **Map** | A block that runs one contained chain once per item of a list (§4). Not a kind. Publishes `branch-results@1`. |
| **Loop** | A block that runs one contained chain repeatedly while a **declared port** stays truthy, bounded by a mandatory `max` (§4a). Not a kind, and **not a back-edge** — the repetition is in the block's declaration. Always sequential. Publishes `branch-results@1`. |
| **Event** | A versioned, namespaced occurrence (`core:event/message-created@1`) that pipelines may subscribe to. The only mechanism by which one pipeline causes another (§8). |
| **Trigger** | Anything that starts a run: an Input entry, an event, a hook, or a UI action. Reserved word — never used for bindings. |
| **Receipt** | The first-class record of a run: every decision, every binding's inputs and outputs, per-node timings, trigger attribution, every gate resolution. |
| **Slot** | An addressable unit of configuration on a node — `prompts`, `template`, `connection`, `settings`. Resolved independently through the scope chain (12-CONFIGURATION). |
| **Preset** | A named admin-owned *selection* of slot values. Presets reference; they never contain. |
| **Override** | A value layered over a spec version's base config at a declared scope, keyed by `node_key` and slot. |
| **Facet** | A declared aspect of node config used by the L2 lens view. Declared in descriptors. |
| **Surface** | A named, versioned UI extension point (`core:surface/chat-message@1`). |
| **Pipeline state** | A pipeline is **enabled** (installed and permitted), **active** (selected for a chat, or subscribed to an enabled event), **triggered** (running or queued), or **inactive** (neither selected nor subscribed). User-facing vocabulary; the default view names pipelines, never "tasks" (05 §0a). |
| **Plugin** | Umbrella term for a distributable package. Three mixable types: **extension** (code), **component** (UI), **pipeline bundle**. |

Terms deliberately *not* used: "Agent" (renamed Provider, §3), "Service" (collides with injected
host APIs), **bare "hook"** (always qualified — the three kinds have different rules), "trigger"
as a synonym for a hook, **lowercase "task" for a pipeline** (retired 2026-08-18 — a pipeline is a
pipeline and a Task is a node kind; the collision is removed rather than tolerated, 13 §7b). *"Binding" is retired in favour of "pipeline hook"; "export" is retired
because public pipeline hooks cover peer composition better — §9b.*

## 2. The kinds (closed)

Five kinds. This taxonomy is closed by constitutional law; the *types within* each kind are an
open registry (§3).

- **Input** — run entry. **Exactly one per spec, positionally first.** Declares the input document
  contract and the pipeline's version, and carries the initial payload (any shape).
- **Query** — reads. Receives a read-scoped data API by injection. Never writes. May run custom
  read code against the extension's own data; may **not** reach the network — that is what
  Provider is for.
- **Task** — pure computation. Receives *no* services by injection; deterministic by construction.
  Purity is enforced at the bundler boundary (shared scope) and by injection. A Task needing
  randomness declares it and receives deterministic RNG derived from the run's recorded seed
  (§5). Assemble is a flagship Task, not a kind.
- **Provider** — external nondeterministic I/O behind a declared shape: LLMs, TTS, image gen,
  embeddings, webhooks-through-Provider, Human-as-Provider. Receipt records the full request and
  response verbatim (§10). *Renamed from "Agent", ratified 2026-08-17: the kind was always
  broader than agency, and "Service" collides with injected-services vocabulary.*
- **Consumer** — the only effect-capable kind. At most **one primary write** per pipeline
  (§7), plus any number of emit-class actions, plus declared event emissions (§8).

There is no State kind. There are no back-edges, and **no branching** (§4). Repetition is a
declared block with a mandatory bound, never an edge (§4a).

## 3. Types, registries, pins

- Type ids are namespaced: `core:query/chat-history@2`, `chariot.tts:speak@1`. The registry
  rejects `core:`-prefixed ids registered from outside core's own directories.
- Every spec enumerates its pins. Compatibility is statically checkable at load time (the audit
  view) and at build time (generated `/contracts` declarations → tsc).
- **Typed ports.** Every node declares input and output shapes. Downstream compatibility is
  checked at publish, which is also what generates the user-facing "valid replacements" list for
  node swapping (12-CONFIGURATION §5).
- Risk ladder, coldest to hottest: constitutional substrate → core types → your own novel types →
  peer capabilities.
- Peer capability pins are **type-level dependencies only**. Runtime peer invocation inside a
  binding is banned (§9).

## 4. Shape of a pipeline — linear, with three collect-and-continue constructs

**A pipeline is a linear order of operations.** There is no branching: no divergent paths, no
conditional routing. Fan-*in* from any earlier node via `$ref` remains legal and essential — that
is a reference, not a branch.

Three constructs provide everything branching used to — **async**, **map** and **loop** (§4a):

**Async block** — declares that several chains start together; core schedules them, awaits all,
and feeds the compiled result to the next sequential node. Chains inside are ordinary nodes,
audited identically. Admins may force any block sequential, or disable async instance-wide.

**Map** — runs one contained chain once per item of a list and outputs a list. Termination is
guaranteed by input length. Declares `sequential | parallel` and inherits the async kill switch.
Map plus a following Task is map/reduce.

Both are collect-and-continue constructs with the same lifecycle, and both are subject to:

- **Equivalence law:** forced-sequential execution produces a result identical to parallel
  execution, modulo timestamps and intra-block ordering. Receipts record which mode ran.
- **No write-class Consumers inside either.** Concurrent writes make ordering observable, and
  N map iterations × one write violates §7. Writes stay on the spine.
- **A declared maximum item count** for maps, validated at publish.
- Budgets apply across all iterations, never per iteration.

### 4a. Loop — the third collect-and-continue construct

*Added 2026-08-18. This supersedes the paragraph that routed condition-driven iteration through
self-triggering recursion; the reasoning that replaced it is below.*

**Loop** — runs one contained chain repeatedly, deciding after each pass whether to run again by
reading a **declared port**, and bounded by a **mandatory maximum**. Always sequential, because each
pass depends on the last, so a `mode` would be a lie.

```ts
.loop('agent', { repeatWhile: $ => $.agent.item.turn.hasToolCalls, max: 8 }, l => l
  .provider('turn', $ => agentTurn({ context: $.prompt.context, connection: slot.connection() }))
  .map('tools', { over: $ => $.agent.item.turn.toolCalls, max: 16 }, m =>
    m.provider('call', $ => mcpTool({ args: $.$item, connection: slot.connection() })))
  .task('fold', $ => foldResults({ results: $.agent.item.tools.values })))
```

**Why the earlier answer was wrong.** Routing bounded iteration through self-triggering recursion
works for background work and fails for the case that matters: a tool-calling turn. Events are
fire-and-forget and cannot rejoin, so a child run cannot hand its result back to the parent's
context. That left exactly one home for a tool loop — **inside a Provider hook**, as one opaque
call — which discards per-step timings, per-step review, per-step budget and the entire
explicability story precisely where users need it most. This design has refused hidden control flow
in adapter failover, in the retrieval-strategy switch and in the write/upsert question; accepting it
here would have been the largest such concession in the system.

**It is not a back-edge.** Like `map`, the repetition lives in the **block's declaration**, not in
an edge that points backwards. The rows contain a block, the executor already knew how to run a
chain more than once, and the graph the lens renders is still acyclic. A loop is a map whose
iteration count comes from a predicate instead of a list length. F9 and F25 are untouched: what F9
forbids is an *unbounded* cycle, and `max` is mandatory for exactly that reason.

**The predicate is a port reference, not an expression.** `repeatWhile: $ => $.agent.item.turn.hasToolCalls`
compiles to a reference. That keeps the construct renderable — *"repeats while `turn.hasToolCalls`,
max 8"* — and keeps a second expression language out of the design. It **must name a node inside the
body**: a predicate computed outside can never change, so the loop would always run to its max, and
that is a publish error rather than a mystery.

**Everything the other two constructs guarantee, this one guarantees too:**

- **Blocks nest.** A map inside a loop is ordinary; the authoring form is nested and compilation
  flattens it to rows with a block tree, so the spine stays legible.
- **Per-iteration scoping.** Each pass writes into its own value scope and reads through to its
  parent, so two iterations never see each other's intermediates. *This also removed the earlier
  limitation that forced every map sequential.*
- **No write-class Consumer inside**, and now for a sharper reason: N passes × one write is not one
  transaction, so it breaks §7 rather than merely making ordering observable.
- **Budgets apply across iterations**, never per iteration.
- **Publishes `core:shape/branch-results@1`**, exactly as async and map do — one entry per pass, in
  order, with a `values` port carrying the `ok` results. One shape for all three constructs, so
  downstream never has to know which produced its input.
- **Reaching `max` is not an error.** It is the bound doing its job — and the receipt records it, so
  a truncated loop never looks like a finished one.

**Two things deliberately *not* done.**

*Halt does not mean "stop iterating."* It already means "stop, and that is correct" (§5); giving it a
second meaning that depends on where it appears is the kind of context-sensitivity that bites two
years later. The predicate ends a loop; halt ends a run.

*Branching is still not a construct.* The case that looks like it needs one — *if the model asked for
search do A, else B* — is a single node whose params carry the tool name. **Dispatch is data.**
Adding real branching would put a path dimension into node keys, the weights lens, preset resolution
and "why was this dropped," which is a large cost for a case that has a better answer.

**Referencing into a repeating block from outside is a publish error.** The fix is the block's own
output — `$.agent.values` for the results in order. *"Whichever iteration happened to run last"* is
not a value anyone means, and it used to resolve silently.

## 5. Execution model (in-memory compute, only commit persists)

- A **run is an in-memory object** from Input to completion. An in-flight run dies with the
  process, exactly like an in-flight generation today. Recovery of lost derived work is by
  scanning data state for underived work (the `graphed` sentinel pattern), never by durable
  queues.
- **Transactions:** one transaction per storage Consumer, opened and closed at commit time. A
  single Consumer may write to several SDK-exposed schemas — they commit together or not at all.
  Nothing awaits inside an open transaction (PGlite is a single connection).
- **Budgets meter consumption, never waiting** — tokens, node executions, adapter-reported usage.
  A parked gate consumes nothing and may wait indefinitely.
- **Timeouts bound execution, and execution is not waiting.** The two are different things and
  conflating them breaks either safety or the review gate:

  | | Bounded? |
  |---|---|
  | **Executing** — a hook running, a sidecar answering, a model streaming | **yes**, by a declared timeout |
  | **Waiting** — parked at a review gate, awaiting a human, awaiting a declared resolution | **no**, free and indefinite |

  "Review it next Tuesday" stays legal; a hook spinning forever does not.

- **Timeouts are declared at three levels, tightest wins:** the type descriptor's default, the
  config layer's override (a `params` value), and an **instance ceiling an admin sets that config
  cannot exceed** — otherwise a plugin declares a six-hour timeout and the ceiling means nothing.
- **A timeout produces `err(timeout)`** — routable, recorded, never a crash. The receipt records
  elapsed time and which limit tripped.
- **Streaming operations need an idle timeout, not a wall timeout.** A model legitimately takes
  minutes to produce a long response; killing it on total elapsed time is a bug that will be filed
  as one. Measure time since the last chunk. Non-streaming calls use a wall timeout. Both may
  apply.
- **⚠ Enforcement differs by transport, and the docs must say so rather than imply uniformity.**
  A `runtime: process` sidecar can be killed — the guarantee is real. An in-process hook **cannot
  be forcibly terminated**; the executor abandons the call, resolves `err(timeout)` and continues,
  but the abandoned code keeps running and can still burn CPU. Mitigation is cooperative: the SDK
  hands every hook an abort signal, and repeated abandonment marks the plugin unhealthy and
  disables it. A genuinely runaway in-process hook is the reason `runtime: process` exists.
- **Edges carry values.** Await-by-default; the declared exception is streaming (§11).
- **Results are discriminated:** the executor normalizes every binding's return/throw into
  `ok(value) | err(reason) | cancelled | halt(reason)`.
  - **`halt` is not a failure.** It means "stop here, and that is correct" — a Task deciding this
    chat type isn't applicable, a guard finding nothing to do. Halt is terminal for everything
    downstream: no further nodes, no emitted events. The receipt records **which node halted and
    why**; without that, "why did nothing happen" is unanswerable, and for event-triggered
    pipelines that is the most common question there is.
- **Every run carries a recorded seed.** Tasks declaring randomness receive deterministic RNG
  derived from it. This keeps Tasks pure (a pure function of inputs, one of which is the seed)
  while keeping `replay(receipt)` exact and making goldens possible for anything random.
- **Caching is the executor's** concern, keyed on recorded inputs, never a binding's.

## 6. The document ↔ rows honesty check

The document is the contract's *projection* — the thing you package, sign, diff, and that all
editor levels emit. Rows are the system of record (02-SPEC-STORAGE).

Testable invariants, golden-enforced:

1. `import(export(rows))` is identity.
2. `export(import(doc))` = `canonical(doc)`; a canonical hash is stored per version.
3. **No dual representation.** The editor writes rows; documents are always derived.
4. **Round-trip law:** every column that affects execution has a home in the document schema.
5. **Promotion law:** only constitutional concepts become columns. Type-specific config stays in
   jsonb.
6. Anything expressible in the SDK must be expressible as a document the in-app editor could have
   produced, and vice versa. The SDK is never a runtime.

## 7. Writes and the review gate

- Write policy is constitutional: Consumers commit through consumer targets under declared
  policy; **propose-as-default** for world data.
- **One primary write per pipeline, where one write = one transaction.** Emit-class actions
  (exposing a result over a named socket handle) do not count against it, and the chain may
  continue past a Consumer — a Consumer returns the ids of rows it created or changed, and that
  result flows downstream like any other node output.
- The **review gate** lives in the executor substrate, below the type layer: after a node's input
  resolves and *before* its binding is invoked, the executor checks the user's review setting.
  **The gate keys on declared effects, not on kind** — Consumers are effectful by definition, and
  Providers declared to have external effects (an MCP tool that sends mail, 14 §4a) join them.
  This is what the gate was always for; keying on kind was a proxy. Consequences, by construction:
  - The gated party never implements the gate. Plugin code cannot decline it, detect it, or
    distinguish an approved payload from an edited one.
  - Spec authors get exactly one power: defaulting review **on** for their own Consumers.
    Forbidding review is not an expressible concept.
- Three positions: `off` (straight commit), `async` (propose — writes land pending, the run does
  not block; durable by nature), `sync` (park — the executor holds an unresolved promise, the
  review card renders over the socket from memory; a restart loses parked syncs, which is the
  regenerate contract, not a bug).
- Review UI is generated from the consumer target's declared input shape (schema-driven, with
  optional titles, descriptions and control-type hints — 10-COMPONENTS §6). Rich renderers via
  `core:surface/review@1`. The plugin surface renders **inside core-owned chrome**: approve, edit
  and reject belong to core, and a raw-JSON/diff toggle is inescapable.
- Decisions are recorded in the receipt at commit — original payload hash, edited payload, who,
  when. Human edits enter provenance; replay honors them.
- Expiry semantics do not exist. Human-as-Provider is the corollary: a core adapter whose
  external call parks a promise and renders a surface.

## 8. Events and lineage

**Only core emits events, and it emits them for its own actions** — chat created, message created,
character updated. A node cannot emit an event, and nothing outside core can define one. Pipelines
and event hooks **subscribe**; they never announce.

Causation between pipelines is therefore **indirect and observed**: pipeline A's Consumer writes a
message, core emits `message-created` because a message was created, and pipeline B — subscribed to
that event — runs. A pipeline cannot invent an event, cannot skip one, and cannot lie about what
happened.

Three things follow, and they are why this is better than letting nodes emit:

- **Events describe what happened to data, not what a pipeline chose to announce.** Core is the
  single source of truth for both.
- **"What causes what" is one table joined against a fixed enum**, rather than the union of every
  spec's emit declarations. Easier to render, audit and cycle-check.
- **The consent list stays legible** (11 §4). A user approving "message created" understands it;
  an open-ended list of plugin-defined event names would be vendor jargon on a consent screen.

Details:

- **Versioned payloads from a closed, core-owned set:** `core:event/message-created@1`.
- **Which write causes which event is declared on the core consumer target**, not per spec — so
  `commitMessage` is known to cause `message-created`, and the static cycle analysis composes
  subscriptions with that mapping without any per-spec declaration.
- **Compatibility is shape matching** between the event payload and a pipeline's Input contract —
  the same mechanism as the Provider swap list, feature attachments and renderer `match`. One
  mechanism, four uses.
- **Delivery is fire-and-forget with no ordering guarantees between subscribers.** Dispatch order
  is declaration order, never completion order.
- **Success-anchored:** emitted by core after the write lands, in memory. There is no `on: failure`
  event; failure paths are run policy owned by the executor. No outbox exists (§5).
- **A node's only outward signal, short of writing data, is a namespaced socket emit** — an
  emit-class Consumer on `plugin:<id>:*`. That reaches the UI; it cannot trigger a pipeline.
- Child input documents are **snapshots** built at emit time; a child never reads live parent
  state.
- **Cycle guards, both layers.** Statically: subscriptions are rows, and a recursive CTE finds
  inter-spec cycles; a cycle is a validation error unless the subscription carries an explicit
  depth bound. Dynamically: every run carries `parent_run_id`, `root_run_id`, `depth`; dispatch
  enforces per-root caps on depth and total descendant count.
- **User consent is default-deny** for anything affecting a user's account or assets
  (11-EVENTS §4). Events are never automatically enabled for a user.

## 9. Hooks — three kinds, one rule about control flow

Everything an extension exposes is a **hook**, and core invokes all of them. What differs is
whether the executor sequences it, whether it appears in the graph, and what it may reach.

| | Sequenced by | In the spine? | Receipt | Budget | May call Providers? |
|---|---|---|---|---|---|
| **Pipeline hook** | the executor | **yes** | full | yes | yes |
| **Lifecycle hook** | core, at defined moments | no | invocation record | own declared budget | yes |
| **Event hook** | core, on a core event | no | invocation record | own declared budget | **no** — §9c |

### 9a. Pipeline hooks

- A node type's implementation: data in, expected shape out. **The executor is the only thing that
  ever sequences them.** Handlers are leaves.
- Because core owns every invocation, core wraps every invocation: budgets metered at the call
  boundary, inputs and outputs recorded in the receipt on both sides of the black box, errors
  normalized to discriminated results, uniform cancellation.
- **Purity by injection:** a Task hook is handed no services; a Query gets a read API; a Consumer
  gets a transaction-scoped commit API. For sidecars purity is physical — no DB channel exists.
- **Transport is a routing-table column, not an architecture.** `runtime: node` (in-process, direct
  async call) or `runtime: process` (JSON-RPC over stdio). Same signature; the executor is
  indifferent. "Core makes a request to the extension" is the logical model, not always the
  physical one.
- **Sidecar Consumers are strictly functional:** they return a commit *description*; core applies
  it.

### 9b. Public vs private, and why "export" is gone

A pipeline hook is **private** (only the owning extension's specs may pin it) or **public** (any
spec may). Public is the whole peer-composition story.

This is strictly better than the previous "export" concept, which was a peer-callable function
brokered by core but **invisible in the graph** — and therefore had to be banned from running
inside a run, which made it a capability nobody could use where they wanted it. A public pipeline
hook has no such problem: another plugin composes it *as a node*, so the dependency is a pin, the
call is a step on the spine, and the receipt records it like any other. Peer composition becomes
visible instead of merely permitted.

Consequences: the export permission category disappears; the "never callable inside a run" rule
disappears with it; and 01 §3's "peer capability pins are type-level dependencies only" stops
being a restriction and becomes simply how it works.

### 9c. Event hooks, and the line that keeps them honest

An extension registers a hook against a **core event** — chat created, message created, character
updated. Useful for the light case: maintaining the extension's own data when something happens,
without standing up a whole pipeline.

But an event hook runs outside the run model, so it gets **no receipt, no replay, no review gate
and no lens view**. That is an acceptable trade for bookkeeping and an unacceptable one for
anything a user would want to audit. Therefore:

- **An event hook may not call Providers.** No model calls, no external I/O with a cost. If work
  needs a Provider, the event triggers a *pipeline*, which brings budgets, receipts and the gate
  with it. This is the line that stops event hooks becoming an unobservable back door around
  everything §5 and §7 guarantee.
- Every invocation is **recorded** — hook, event, time, duration, outcome — even though it is not a
  full receipt. "What ran and when" stays answerable.
- **Consent and permissions apply identically** to hooks and pipelines (F30): an event hook
  touching a user's data is default-deny for that user, and read-only access remains
  non-refusable.
- A throwing event hook is contained and reported; it never fails the originating action.

**Author guidance the docs must state plainly**, or hooks get used for everything and the receipt
story quietly erodes: *use an event hook to maintain your own data; use an event-triggered
pipeline for anything that touches a user's data, calls a model, or that anyone might later ask
you to explain.*

### 9d. The UI channel follows the same principle

Extensions never write socket handlers; they declare them, and core registers and forwards. Core
therefore wraps those invocations too — permission checks, payload validation, rate and
subscription limits, error normalization (10-COMPONENTS §5).

## 10. The Provider kind (external I/O)

- `bindProvider(descriptor, handler)` like every other kind — the old `hostAgentAdapter`
  asymmetry is dissolved; sidecar-ness is transport (§9), not a Provider property.
- Core does **not** provide a universal model API. Swappability comes from **shared shapes**:
  `core:shape/text-gen@1` is a convention core's own adapters implement; any adapter implementing
  the same shape is drop-in swappable.
- Core's own adapters (Ollama, KoboldCPP, OpenAI-compatible) are `core:provider/*@1` entries in
  the same registry.
- Nondeterminism is declared; the **receipt records request and response verbatim** — replay never
  re-infers. Usage extraction is declared in the descriptor.
- **Connections (core adapters):** core adapters declare the connection kind they need and never
  touch credential storage. Core keeps custody; node config references a connection id; the
  executor resolves and injects material per call. Connection kind = the shape the Provider
  produces, so adding TTS or image gen is a new shape plus an adapter, not a new table.
- **Material vs metadata.** A connection's **material** — keys, tokens, secrets — is injected per
  call and is never readable by any node, core's included. A connection's **metadata** — context
  length, tokenizer id, model name, supported samplers — is declared by the adapter and **is**
  readable, because it is not a credential and budget-aware retrieval is impossible without it
  (16 §5b).
- **Connections (extension adapters):** core connection data is **never** exposed over the SDK, to
  any extension, under any capability. An extension adding support for a new external API owns
  the whole vertical: its own connection type, its own credential storage. The reasoning is
  custody, not distrust — SP declines to be the custodian of secrets it cannot audit. A plugin
  managing its own credentials declares so in its manifest and says so at install.
- **Failover is banned inside adapters** — a decision the spec never made and the graph can't
  show. **Retry is not failover**: same connection, transient error, and it lives in the
  connection adapter as optional per-connection config, with attempts recorded in the receipt and
  persistent failure raising an admin notification. Provider uptime is an admin concern, not a
  pipeline one.
- Human-as-Provider: a core adapter that parks a promise and renders a surface (§7).

## 11. Streaming

Streaming lives on the edge — the one declared exception to await-by-default.

- **Stream compatibility is static.** The edge shape declares stream-capability and the consumer's
  input port declares acceptance, checked by the validator at publish. Whether a pipeline streams
  is readable off the spec, not discovered by running it.
- A consumer that supports streaming starts immediately; one that doesn't awaits the settled
  value.
- **Early completion must be declared.** A node whose descriptor declares `earlyExit` may finish
  before the stream ends; the executor cancels the upstream stream through the existing stop
  machinery, records the truncation and tokens consumed, and continues. A node returning while a
  live stream feeds it *without* declaring early exit yields `err(stream-abandoned)` — terminal
  by default.
- **Chunk boundaries are transport, never data.** The receipt records the assembled response and
  usage, not the chunk sequence. A node behaving differently for `["hel","lo"]` versus
  `["hello"]` is not replayable; the harness asserts the equivalence.
- **No backpressure — buffer to completion.** Throttling an LLM API mostly doesn't work, and a
  response is bounded by its own token limit.
- **Fan-out tees**, buffered for the slower consumer.
- **Emit during generation, commit once at settle.** Progressive row updates would violate the
  one-transaction-at-commit rule.
- Cancelled streams still bill for tokens produced.

## 12. Core self-reference and the incubation ledger

1. **All effectful work flows through nodes — for everyone.** No orchestration between nodes, no
   writes outside Consumers, no model calls outside Provider bindings. Core included. *Carve-out:
   lifecycle hooks and exports run effectful code outside the node model, scoped to the plugin's
   own tables, files and exports, never core-table writes and never orchestration of another
   plugin's pipelines. A throwing startup hook disables that plugin and raises an admin
   notification; it never blocks boot.*
2. **Core's types are registered, pinned, declared contracts like everyone else's.**
3. **Binding interiors are opaque — symmetrically.** Core's chat-history Query calling raw Drizzle
   against unexposed schema is the same move as an extension's Query calling its own SQLite file.

**SDK access has four levels**, addressed by path, nested inside the existing scope layout:
`sdk.<scope>.<visibility>.<owner>.<apiVersion>.<namespace>`.

| # | Path | Who may call | Gate |
|---|---|---|---|
| 1 | `public.core.…` | anything | declared permission + admin grant |
| 2 | `private.<ownSlug>.…` | that extension only | ownership |
| 3 | `public.<slug>.…` | anyone, including the owner | pinning a public pipeline hook + grant + dependency pin |
| 4 | `private.core.…` | core-owned nodes and hooks only | ownership |

**A private namespace is callable only from code its owner ships**, judged at the call site —
never as a property of the pipeline the node is composed into. Core is simply another owner,
which keeps point 3's symmetry exact rather than carving an exception into it. Users therefore
compose core nodes freely, and those nodes call `private.core` internally; there is nothing to
check at the pipeline level. **Ownership is by namespace, not directory** — `contrib/` extensions
live in the SP repo but get `private.<theirSlug>`.

**`private.core` is the incubation ledger, made enumerable.** Every symbol in it carries a
promotion criterion. Enforcement is by generation, not review: each codebase's SDK definitions
contain only that owner's private namespace, so forbidden calls are unspellable and untyped.

## 13. Amendment process

Changes to the constitutional sections and Fixed Ledger require a written amendment stating the
law changed, the migration for existing specs and types, and the dogfood proof (which core
feature exercises the change). Everything else is normal review.

## 14. Fixed Ledger

| # | Law | Enforcement |
|---|---|---|
| F1 | Five kinds, closed | DB CHECK constraint on `pipeline_nodes.kind`; validator |
| F2 | Types are open registries; ids namespaced; `core:` reserved | registry rejection outside core dirs |
| F3 | Rows are the system of record; documents derived | export/import identity goldens; canonical hash |
| F4 | Round-trip law: execution-affecting columns ⊆ document schema | schema review gate + golden |
| F5 | Promotion law: only constitutional concepts become columns | schema review gate |
| F6 | SDK is never a runtime; spec is a value. **SP imports compiled documents, never authoring JS** — no importer path evaluates a builder chain | no callable spec; importer parses documents only |
| F7 | One primary write per pipeline = one transaction; emits unlimited; chain may continue past a Consumer | validator counts write-class Consumers |
| F8 | **Only core emits events, from a closed core-owned set.** Nodes never emit and plugins never define events; they subscribe. Inter-pipeline causation is indirect, via data changes core observes. Success-anchored; no `on: failure`; subscribers independent. Two families: **data** events (a change happened — carry write-target mappings, so they are cycle-checked) and **action** events (someone asked: `ui-action`, `schedule-tick` — no write targets, so they cannot participate in a write→event cycle). Same registry, same consent screen | no emit API exists; event registry is core-owned; dispatcher; cycle CTE reads data events only |
| F9 | No branching, no back-edges; inter-spec cycles need declared depth bounds; runtime depth/descendant caps. **Repetition is a declared block with a mandatory `max`** — map by list length, loop by a declared predicate — never an edge that points backwards (§4a) | recursive CTE (both layers); dispatcher caps; validator rejects an unbounded map or loop, and a loop predicate computed outside its body |
| F10 | Control flow never leaves core; handlers are leaves; peer composition is pinning a **public pipeline hook as a node**, never calling a peer function mid-run | injection scoping; no peer-call API in the injected surface |
| F32 | **No hook calls a Provider.** Event hooks and lifecycle hooks alike: anything needing model work runs as a pipeline, so it gets a receipt, a budget and the review gate rather than quietly opting out of all three. Lifecycle hooks additionally may not trigger pipelines; their surface is scoped core reads plus read/write on the extension's own namespaced rows. Scheduled model work subscribes to `core:event/schedule-tick@1` — which also puts it on the consent screen, where a lifecycle hook doing the same work would be invisible | injected surface omits Provider access and any trigger API; conformance probe |
| F11 | Purity by injection per kind; Task = shared scope; randomness comes from the run's recorded seed | bundler boundary; injected service surface; seed recorder |
| F12 | Transactions open/close only at storage-Consumer commit; never await inside | executor; PGlite single-connection reality |
| F13 | Budgets meter consumption, never waiting; map/async budgets apply across iterations | budget engine |
| F36 | Every hook invocation, sidecar call and process has a declared timeout — descriptor default, config override, admin ceiling that config cannot exceed. Timeouts bound **execution**; waiting stays free. Streaming uses an idle timeout. A trip yields `err(timeout)`, recorded with elapsed and limit | executor timer; sidecar kill; abort signal + unhealthy-disable for in-process |
| F14 | Review gate in executor substrate, keyed on **declared effects** not on kind; author may default-on, never forbid; irrevocable and undetectable | executor placement; no forbid concept in schema |
| F15 | Review decisions enter receipts | receipt recorder |
| F16 | Provider I/O recorded verbatim; replay never re-infers; chunk boundaries are not data | receipt recorder; harness equivalence test |
| F17 | No universal model API; swappability via shared shapes; connection kind = produced shape | shape registry |
| F18 | Core adapters never hold credentials (core custody, per-call injection); extension adapters never receive core connection data. Connection **metadata** is readable; connection **material** never is | connection resolver; no SDK surface exposes material |
| F35 | Configuration is resolved run-wide before execution, so a node may reference another node's resolved config — that is a declared, checkable dependency and never a data edge | config resolver runs before the graph; validator checks the reference exists |
| F19 | Sidecars have no DB channel; sidecar Consumers return commit descriptions | process boundary (physical) |
| F20 | Config writes are overrides only, resolved per slot through the scope chain — never as a bundle | write path; per-slot permission matrix |
| F21 | `node_key` is explicit and stable; overrides, receipts, lenses and `ctx.state` key on it | builder API; sync preserves overrides |
| F22 | Streaming lives on the edge; compatibility is static; early exit must be declared | edge model; validator; harness |
| F23 | In-memory runs; restart loses in-flight work; recovery = scan for underived work | no durable run queue exists |
| F24 | Frontend surfaces never cross-communicate via window events; coordination goes through the data layer | surface contract; conformance kit |
| F25 | No branching. Parallelism is async blocks and maps; conditionals are halt-or-continue | validator; linear spine |
| F26 | Forced-sequential execution of any async block or map produces an identical result | harness equivalence test |
| F27 | **Nothing is discovered at runtime.** Pipelines, hooks and components are all compiled into the manifest ahead of time; the loader reads named files and never scans or executes to discover | no runtime registration API exists, for anything |
| F33 | A plugin bundles every runtime dependency it needs, per supported platform. The host is never presumed to have anything. The two escape valves — a declared host requirement, and a fetched dependency — are **checked**: requirements verified at install, fetches declared in the manifest with a checksum | per-platform artifacts + checksums; install-time requirement check; checksum on fetch |
| F34 | In-flight node progress is ephemeral: delivered over the socket, never recorded in a receipt, never able to affect replay | progress channel is write-only to the socket; receipt recorder has no progress field |
| F28 | Every SDK call is checked at runtime against the hash-verified manifest **and** the admin's grant | forwarding layer; resolved-once permission set |
| F29 | Core data is never deleted programmatically; core's default chat pipeline is never removable | no bulk-delete API; loader guarantees the default |
| F30 | User consent is default-deny for anything affecting a user's account; read-only access is not refusable. An admin's own action implies their own consent, and the opt-in UI is hidden entirely when accounts are disabled — the record is still written either way | consent registry; 11 §4–§4a |
| F31 | External tool metadata (MCP annotations) and generated permission lists are advisory input to a human decision, never an automatic grant | admin classification stored on the snapshot; 09 §4, 14 §4 |

## 15. Decision ledger

Carried: Human-as-Provider · webhooks-through-Provider · embeddings split · no State kind ·
streaming = edge model · caching = executor · loops/recursion = constructs and budgets, never
back-edges · Assemble = flagship Task.

Resolved 2026-08-17: **MCP** supported as core connection kind + Provider types, never as a plugin
category (14) · **pipeline customization hidden by default**; the front door is the pipeline view
(05 §0a) and chat types are tasks in it · **admin self-consent**, and consent UI hidden when
accounts are disabled · review gate keyed on **effects, not kind** · Agent → **Provider** ·
branching **dropped**; conditionals are halt-or-continue and parallelism is async blocks and maps ·
effects **subsumed by events** ·
fallback is **not a pipeline concern**; retry is transport · SDK **four access levels**, gated by
call-site ownership · configuration **separated per slot**, presets select rather than contain ·
components ship **virtual tier first**, native later · plugins **disabled by default** globally ·
user consent **default-deny** · randomness via **recorded run seed** · **map, not loop**.

## 16. Non-goals / banned (write them down or agents will invent them)

- No durable run queue, outbox, or checkpoint-replay engine. No gate timeout or expiry policy. No
  `on: failure` events.
- **No pipeline branching.** No divergent paths, no conditional routing. Fan-in via `$ref` is a
  reference, not a branch.
- **No general loop node.** A conditional loop needs an accumulator, which is a State kind by the
  back door. Map for known-size batches; self-triggering recursion for condition-driven
  iteration.
- No universal chat-completion API. No adapter-internal **failover** — though per-connection
  **retry** is transport and is allowed.
- No runtime peer binding calls. No plugin-owned HTTP listeners. No plugin-to-plugin sockets. No
  window-event coordination between surfaces. No plugin-authored socket handlers.
- No raw Drizzle access for plugins against core tables; no plugin migrations on core schema.
- No auto-generated node keys. No dual spec representation. No callable specs.
- **No undeclared runtime fetching of executable code.** A plugin may fetch dependencies, but only
  ones declared in the manifest with a checksum (03 §3) — otherwise the reviewed plugin and the
  running plugin are different things and the whole verification chain is theatre.
- No sandbox theater for raw plugin code. *SDK-mediated access **is** enforced at runtime against
  the verified manifest and the admin's grants (F28); arbitrary code in hooks remains
  unsandboxed. State both halves — the old blanket sentence undersold the model.*
- **No automated deletion of core data — ever.** No SDK API, no plugin permission, no admin bulk
  action that removes a user or a user's content programmatically. Removing a person or their
  data is a manual, per-item act. This is deliberate friction: it makes turning an SP instance
  into a gated paid service, or holding a user's content hostage, tedious enough to discourage.
  An agent will read this as a missing feature and try to add it. It is not. (Plugin-owned data
  in the plugin's own namespace is exempt — uninstall may clear it.)
- **No user-account export**, and no plugin path to edit accounts. Users export their own
  personas, chats and prompt configs (12-CONFIGURATION §7); accounts are not a portable object.

## 17. Open questions

Live rulings are tracked in **13-OPEN-RULINGS.md**. Summary of what remains constitutional:

| Q | Status |
|---|---|
| Joined effects under event unification | **Open — structural** (13 §1) |
| Receipt retention and size policy | **Open — urgent** (13 §2); halt-heavy event pipelines make it a per-message multiplier |
| Per-user run caps and parked-gate ceiling | Open (13 §3) |
| Group-chat ownership for chat-scoped config | Open (13 §4) |
| Encryption key management for connections | Open (13 §5) |
| Secret-typed plugin settings | Open (13 §6) |
| Budget owner for UI-initiated runs | Open (13 §7) |
| L1 fold into L2 (permission-enforced collapse) | Recommendation stands (05 §7) |
| Facet naming | Open; cosmetic |
