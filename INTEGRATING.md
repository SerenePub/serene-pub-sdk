# Integrating the SDK into Serene Pub Core

The ordered path from today's SP Core to a pipeline-backed one. Every step names the thing
that proves it, because "we wired it up" is not a result — a conformance requirement going
green is.

Read `08-BUILD-PLAN` for the units and their acceptance criteria; this document is the
sequence and the seams, not a second copy of the plan.

---

## 0. The decision that shapes everything else: core _uses_ the executor

Two ways to integrate, and they are not equally good.

**Core imports `@serene-pub/sdk` and runs its executor**, supplying the effectful parts —
bindings to real services, connection resolution, receipt persistence, the gate's parking
store, streaming transport, budget accounting. The laws have exactly one implementation.

The alternative — core writes its own scheduler and treats the SDK as a spec — produces
two implementations of F9, F25, F26, halt semantics, block scheduling and budget metering,
which will drift, and the drift will be discovered by a user whose run behaves differently
from the same run in the harness.

**Take the dependency.** The conformance kit exists so that a second implementation _can_
be proven equivalent later, if transport or performance ever forces one. That is a door
worth keeping open and a door not worth walking through in 0.6.

What core still owns, because none of it is pure:

| core owns                                    | why it cannot live in the SDK                         |
| -------------------------------------------- | ----------------------------------------------------- |
| bindings for every core type                 | they touch the database, the network, the file system |
| connection resolution and credential custody | F18 — material never leaves core, not even to the SDK |
| receipt persistence and retention            | rows, and a retention policy that is a system setting |
| the gate's parking store                     | a parked run outlives the process                     |
| streaming transport and sockets              | wire protocol, not pipeline semantics                 |
| real budget accounting                       | metered against actual provider usage                 |

And what core must **never** do, whatever the temptation: evaluate a plugin's authoring
JavaScript. F6 means core imports documents. `serene-pub build` runs on the author's
machine, and its output — a manifest plus documents, both plain data — is the only thing
core reads. `checkInstall` decides installability from that data alone (13 §10c).

---

## 1. Sequence

Each step is shippable. Nothing in steps 1–6 is user-visible: the pipeline path runs beside
the existing one until step 7 flips it.

### Step 1 — Schema and the document model (U1)

Tables from `02 §2`. Take `compile`, `exportDocument`, `importDocument` and the canonical
hash from the SDK rather than writing them: the identity law is the one place where a
subtly different implementation is indistinguishable from a correct one until an export
fails to import a year later.

**Proves it:** conformance **C1** — `import(export(doc))` is identity and the hash is
stable. Run it against real rows, not fixtures.

### Step 2 — Type registry and boot sync (U2)

`snapshotRegistry(allDefinitions(), { release })` projects descriptors into registry rows
(core: `pipeline_definition_registry`, one per slug, and `pipeline_definition_declarations`,
one per content hash). Sync on boot.

**Edit a declaration and it publishes under a new hash; there is nothing to version.**
A slug — `acme.dice:roll@1`, `acme.dice:spec/board@1.0.0` — is an *indirection* to a content
hash, and the rows are keyed by that hash. Boot compares what your package declares against
what the instance already holds: an unseen declaration is filed under its hash and the
slug's current pointer moves to it, while the declaration it moved off stays exactly where
it is, so every receipt that pinned the old hash still resolves. Nothing is rewritten,
nothing is deleted, and no migration is involved — correcting a range, declaring a port you
were always supplied, fixing a default, all reach an install by republishing. What still
calls for `@N+1` is a change that **breaks the documents pinning the old one**: a removed
port, a narrowed range, a withdrawn enum option. That is a judgement about your consumers,
not a technical constraint — the instance will publish either way.

**Proves it:** sync idempotence, republishing a changed declaration and finding the previous
one still resolvable by its hash, plus `checkInstall` returning clean for a document compiled
against this release and `E_SHAPE_DRIFT` for one compiled against another. The last is the one
worth having a fixture for — every id resolving while a shape has moved is the failure a
version number alone does not catch.

**A published definition is bound, provisional, or gone — the boot says which (plans/29 R-2).**
After the sync, `assertCoreDefinitionsBound` walks every `core:` definition the build publishes
against `coreBindings()`: one with no handler and no `provisional: true` refuses a dev boot with
the list, and is said once on `console.error` in production. `provisional` is the declaration's
own word for *a plan owns this, nothing runs it yet* — **policy, not contract** (plans/31 V6), so
binding it later moves no pin: the registry row's `policy` and `status: 'provisional'` are refreshed
in place on the next sync. No listing that offers definitions
shows it, `validate()` refuses a document placing it (law R-2, *bind it or remove the node*),
and the executor refuses the node with the same sentence. The sync is also a **reverse-diff**
when told it holds the owner's complete set (`complete: true`, which core's boot passes): a row
whose slug the build does not declare is marked `status: 'removed'` with `removed_at`, never
deleted — a stored spec may still pin it, and `reconcilePlacedNodes` turns each such pin into a
config notice of kind `unbound` rather than a refused boot. A host integrating the SDK keeps the
same three facts: which of its published definitions have handlers, which are provisional, and
which a stored document pins that the build no longer publishes.

### Step 3 — Executor and bindings for what already exists (U3, U5)

Bind the core types to the code that already does the work:

| type                             | binds to                                            |
| -------------------------------- | --------------------------------------------------- |
| `core:query/session-history@1`   | today's history loader                              |
| `core:query/lorebook-triggers@1` | today's World Info scan                             |
| `core:task/assemble@2`           | today's prompt builder, behind the allocation shape |
| `core:oracle/generate-text@1`    | today's connection adapters                         |
| `core:outlet/create-message@1`   | today's message insert                              |

Nothing is rewritten in this step. Each binding is a wrapper, and the wrapper is where the
old code keeps living. One addition at the message outlet: blocks with choices/forms are
stamped with the writing spec's identity via `stampBlockActions` — the seam U5d builds the
`blocks` port on.

**Proves it:** **C3** (halt is halt, not err), **C4** (seed recorded, replay identical),
**C6** (budgets meter consumption, waiting is free), **C7** (timeouts bound execution, not
waiting), **C8** (forced-sequential is identical to parallel).

**Status:** all five are bound in `src/lib/server/pipelines/runtime/bindings.ts`
(`session-history`, `lorebook-triggers`, `assemble@2`, `generate-text`, `create-message`),
and a reply pipeline runs end to end. The options below record why `assemble` and
`generate-text` were bound the way they were.

### Handler input types come from the contract

A handler's `input` is **derived from the type it is bound to** — its `ports.in`, its
declared slot names, and its `params` slot's schema. It is not hand-written and it is not
`any`:

```ts
import type { InputOf } from '@serene-pub/sdk'
import type * as C from '@serene-pub/contracts'

const semanticSearch = async (input: InputOf<typeof C.vectorSearch>, ctx) => {
	input.vectors // ✅ a declared in-port
	input.scope // ✅ likewise
	input.params?.topK // ✅ a declared parameter — typed `number`, from `type: 'integer'`
	input.topK // ❌ compile error: a parameter, not a port
	input.params?.minScore // ❌ compile error: not in the schema
}
```

Two things follow, and both are the point:

1. **A declared field nothing reads is visible.** It has a name in the type; if no handler
   touches it, that is a fact somebody can go and look at rather than a control that
   renders, validates, saves and does nothing.
2. **A read of an undeclared name does not compile.** That is the class of defect this
   replaced. `core:query/vector-search@1`'s binding read `input.topK` — a _parameter_, not
   a port — so every install searched at the literal behind the `??` while a rendered,
   validated, saved and scope-resolved value reached nothing at all.
   `core:query/session-history@1`'s `limit` was the same defect, and both were found by
   hand, after shipping.

Parameter _values_ are typed from the field language: `type: 'integer'` is a `number`,
`type: 'enum'` with `of: [...]` narrows to those choices. Port _values_ stay `any` on
purpose — a port declares a `ShapeId`, which is a string id in a runtime registry with no
TS payload behind it, so there is nothing to derive a value type from. The names are the
half that was broken.

#### One handler, several types

A handler is coupled to a **shape**, never to a type id. Bind one to several types and its
input is the **intersection** of what they supply — it may read only what _every_ one of
them declares:

```ts
// world lore, character lore and history are one scan filtered three ways
async function loreFor(
  source: string,
  input: SharedInput<[typeof C.worldLore, typeof C.characterLore, typeof C.historyEntries]>,
  ctx,
) { … }
```

That is what makes binding one function to three ids sound: whichever type the run
resolved, every name the handler touches is declared by it. Typing it against _one_ of
them and assuming the others match is only ever right by coincidence — the day one lane
declares a port the others lack, the handler reads `undefined` on two lanes out of three
with nothing failing anywhere.

#### The runtime check

Two consumers of this rule cannot typecheck anything: **a plugin binding another plugin's
public handler** (two separately compiled artefacts, neither `tsc` run saw the other), and
**the admin-side orchestrator**, where a person composes nodes in a form. For those the
same rule is checked as data:

```ts
structuralCompat(
	{ ports: ['vectors', 'scope'], params: ['topK'] }, // what the handler reads
	C.vectorSearch, // what the type supplies
)
// → { ok: true }
// → { ok: false, missingPorts, missingParams, typeMismatches, message }
```

A handler declares what it reads with `reads<typeof C.x>(hook, { ports, params })` — the
arrays are typed against the definition, so a misspelt name fails to compile — or with the
untyped `declaresReads(hook, { ports, params })`; a plugin declares it in its manifest, on
its binding entry (`{ hook: 'search', reads: { ports: [...], params: [...] } }`). That
binding is `hooks.nodeHandlers` — `{ '<definitionId>@<version>': 'search' }` — since D-6b,
where `nodeDefinitions` became the array of summaries the audit screen and the registry
projection read; the map spelling under `nodeDefinitions` is still read, for a manifest
written by hand. ⏳ `serene-pub build` writes the plain-string form (it has no way to
derive what a handler reads), so a packaged plugin declares no reads and is held to
nothing — the typed `reads<…>()` at the author's own call site is what holds it there.
**Every core handler carries one** (R-12, 2026-09-16), and the declaration is held in both
directions: `bindingCompat.ts` refuses a boot where a handler reads what its definition does
not supply, and `boot/declaredReads.ts` fails the suite where a definition declares an
in-port, slot or parameter that no handler reads — the shape `topK`, `minScore` and
`session-history.limit` shipped in. A declared name may go unread only on that file's
allow-list, with a reason naming what closes it; the list is printed on every run.
`requiresOf(...contracts)` stays as the runtime twin of `SharedInput`, for the *supplies*
direction of a shared handler's group.

The supplying side reads a pinned contract, a bare descriptor, **or a
`pipeline_definition_registry` row** — the last one is not a convenience. A `transport: 'process'`
plugin type has no in-process descriptor, and F6 says core reads a plugin's declaration
from what it stored at install rather than loading the plugin to ask. A check that only
worked on descriptors would be a check that did not work on plugins.

The verdict is a **report**, never a bare boolean: "incompatible" with nothing named is the
kind of refusal people work around rather than fix.

### ⚠ The seam this step actually hit: assembly and dispatch are one thing today

`BaseConnectionAdapter.generate()` **builds its own prompt**. It owns a `PromptBuilder`,
calls `compilePrompt()` internally, and returns the compiled prompt alongside the
completion. There is no way to hand an adapter a payload and ask it only to send.

The pipeline model splits those: a Task allocates, a Provider dispatches. That split is not
bookkeeping — it is what makes the preview possible at all, because a preview is the run
halting _after_ the payload is formed and _before_ it is sent (C13). An adapter that forms
the payload inside the send has nowhere to halt.

Three ways out, and they are not equal:

1. **Extract a dispatch-only entry point** — `generate()` keeps its current signature and
   grows a sibling that takes an already-compiled prompt. The seven adapters change
   mechanically; `generate()` becomes `compilePrompt()` followed by the new method, which
   keeps today's callers byte-identical by construction. **Recommended.** It is the only
   option that leaves one implementation of dispatch.
2. **Wrap the whole adapter as the Provider** and let `assemble` pass through. Fast, and it
   gives up the preview, the gate's view of the payload, and every token figure — which are
   the features the pipeline work exists to deliver. A shortcut that removes the destination.
3. **Reimplement dispatch behind the Provider** and leave the adapters for the old path.
   Two implementations of every provider protocol, diverging from the first bug fix onward.

Option 1 also decides the shape of `assemble`: PromptBuilder is already pure given its
inputs — the caller hydrates the session and passes it in — so `assemble` can wrap it directly
**provided a Query loads those inputs first**. A Task is handed no services (F11), so the
hydration cannot happen inside `assemble`; it belongs in a Query, and connection **metadata**
reaches it while material never does (F18).

**The embedding connection a core node reads.** A pipeline never chooses its embedding
connection: the host embeds through the install's one active embedding connection, so
`core:oracle/embed-text@1` and the sprite picker `core:oracle/pick-sprite@1` declare no
`connection` slot (2026-10-05). `core:task/query-windows@1` declares one — `requires:
['text->embedding']`, wired as its own `slot.connection()` in every shipped spec — and reads one
fact off it under `searchByMeaning: 'auto'`: whether it resolved to a connection at all.
Resolved, an embedding model is set up and Automatic searches; unresolved, it does not, and the
receipt says why. Nothing else about the connection is read — not where it runs, not whether it
bills: a local model and an embedding service search alike. One duty comes with it: **hold that
slot at the connection the host embeds through** — offer no pick for it and drop a stored one —
or Automatic decides about a connection the embed never uses. With nothing stored, the executor
resolves it to `world.activeConnection` under the slot's own `shape` (a Task has no shape of its
own), so publishing the active embedding connection there meets the duty.

### Node clocks — `wall` and `idle` (F36)

Every invocation is timed by its definition's `timeoutMs`, and `timeoutKind` says what that
measures. `'wall'` (the default) is start to finish. `'idle'` is the gap between signs of
progress: each **pulse** restarts it. The generating oracles (`generate-text`, `-json`,
`-with-tools`, `generate-image`, the summarize and graph steps) declare `'idle'` — a long reply
that streams steadily is not a stalled one. `RunOptions.timeoutCeilingMs` caps every
`timeoutMs` and is also the absolute bound on an `idle` invocation, however much it pulses.

There is one pulse, reached two ways:

- **`ctx.pulse()`** on every kind's ctx — for a handler whose long work is its own.
- **`CallHandles.pulse`** — the fourth argument to `HostServices.call(payload, node, run,
  handles)`. The request an oracle's `ctx.call` asks for is performed by the host, and only
  the host sees it make progress, so the executor hands the host both ends of the node's
  clock: `handles.pulse` (the same function as `ctx.pulse`) and `handles.signal` (the node's
  own signal, which aborts when its clock runs out).

What core does with them (`src/lib/server/pipelines/runtime/callTether.ts`): the dispatch is
handed `AbortSignal.any([run's cancel, handles.signal])`, so a node that times out aborts its
request — KoboldCPP is told `/api/extra/abort` instead of generating into nothing with the next
request queued behind it. It pulses on every streamed chunk (body and reasoning), on every
queue status change, and on a steady beat while the request is in flight (queue wait, a
managed model loading, prompt processing, an unstreamed reply): a request that is out with its
connection open is alive. A stalled stream is the adapter's to judge (its own idle watchdog,
`idleTimeout.ts`); the node's idle window judges the host's stages around the request; core's
ceiling (`NODE_TIMEOUT_CEILING_MS`, an hour) ends what never ends. A host that wraps another
host's `call` must forward `handles`.

**Proves it:** `sdk-tests/idle-timeouts.test.ts` (idle restarts, wall ignores pulses, the
ceiling bounds, a timeout aborts the host's signal) · `serene-pub/src/lib/server/pipelines/
runtime/streamTimeouts.test.ts` (a 150 s body and 60 s silence + 60 s reasoning against the
reply node's own 120 s idle clock; a node timeout closes a KoboldCPP request and posts its
abort).

### Step 4 — Parity, before anything flips

The acceptance criterion for replacing the prompt builder is **byte-identical output**,
measured on the **preview payload** rather than on a second renderer written for the
occasion (`08 §5b`). `checkParity` and `parityGate` are in the SDK.

`parityGate` fails an empty corpus on purpose: "nothing was checked" is not "nothing was
wrong", and an integration that reports green over zero fixtures is the single most
expensive mistake available here. Build the corpus from real sessions — group sessions, sessions
with lorebooks, sessions at the context limit, sessions with custom prompt configs.

**Proves it:** every fixture byte-identical, over a corpus somebody looked at.

### Step 5 — Migrate user configuration (U16, `08 §5b`)

Existing prompt configs become presets. `migratedSlug(table, id)` derives the slug so the
job is **safely re-runnable** — a migration that generates fresh ids on every run cannot be
resumed after it half-finishes at 3am.

Two things must not happen: a config that lands nowhere without a report, and a config that
lands at the wrong scope. `MigrationReport` requires a reason on every non-migrated entry,
and `assertReportComplete` fails the job rather than the user's expectations.

If any legacy spec still pins `commit-message@1`, `splitCommitMessage` rewrites it —
converting where the document says what it meant, reporting `unmapped` where it does not
(13 §10b). The unmapped ones need a person; there will not be many.

### Step 6 — Review gate, receipts, events (U6, U8, U9)

The gate keys on **declared effects, not kind** (F14, ratified 13 §7a), so an effectful
Provider gates exactly like a Consumer. The substrate placement is what makes it
undetectable to plugin code — a gate a plugin can notice is a gate a plugin can route
around.

**Proves it:** **C5** (replay without calling the Provider), **C11** (an admin kill is
`cancelled` with an actor, not `err`), **C12** (an event-triggered halt before any effect
compacts; a click does not), **C14** (no receipt in the corpus contains a credential).

**Who portrays whom (R-21 (4), U5a).** Core resolves it — `runtime/portrayals.ts`, from the
session's members, cast and persona rows — **once, before `run()`**, and hands the map in as
`RunOptions.portrayals`; the executor stamps it on the receipt at construction and never
reads it. It rides `HostScope.portrayals` read-only for the host's own seams and is
deliberately not on any node's `ctx`: a definition that needs the answer declares an in-port
and the spec wires it. Resolved for every run with a session behind it except a pre-call
preview (`preview: true` — nobody speaks, so nobody is portrayed); a `{ atNode }` run is
answered. The inlet's `speaker` port is a participant reference (`character:<id>` |
`envoy:<slug>`), the one form audiences use, and the speaker is the AI's unless a member's
presence portrays them.

**The built-in writes (R-15, U5b).** *Anything that alters message state is a built-in*: core
implements the write and it always emits what changed and what was lost. A venue's handler makes
the permission checks it alone can make and hands the request to `runBuiltIn`
(`runtime/builtins.ts`), which runs the built-in's own one-node spec — `core:spec/builtin-delete`
… (`BUILTIN_SPEC_IDS`), `core:inlet/built-in-request@1` straight into the write outlet
(`BUILTIN_OUTLET_IDS`) — through the same `runSpec` every turn takes, as an `action` run. Four
things follow from "it is a run":

- **It is receipted and gate-eligible.** An administrator may turn review on for a delete. An
  effectful definition declares what a reviewer may edit — `Descriptor.review.fields`, an
  allow-list of in-ports; the host builds the form through `reviewSchemaFor` and refuses a decision
  naming anything else (`undeclaredReviewFields`). The five built-ins never list `target`,
  `fromMessage` or `index`: identity is settled when the request is made. Absent a declaration the
  form is the whole payload, as before.
- **The host re-judges the actor at the commit.** `messages/permissions.ts` is the one item rule
  (`canActOnMessage`); the handler asks it before the run and `host.ts` asks it again, against
  `scope.userId`, on the id the write is about to use. A built-in outlet placed in any document but
  the built-in's own is refused by `validate()` (finding `R-15`) and by the host on `scope.specId`.
- **It records a session change.** Each commit writes a `session_changes` row
  (`messages/sessionChanges.ts`); `runTurn` reads the unconsumed rows before the run and publishes
  them on the turn inlets' **`sessionChanges`** port (was `changes`), marks them consumed after the
  run and only when it produced a reply, nulls the content they carried on the row once consumed,
  and ends the list with `core:event/session-changes-truncated@1` past the cap of fifty.
- **The event is declared with its payload.** `EventDef.payload` names the shape
  (`core:shape/session-change@1` for every built-in's event); the registry projection carries it to
  `pipeline_event_registry.payload_shape`, so a listener can be checked against what it will receive
  without loading anything.

**Forms and the effects line (R-15 *Forms* · *The line*, R-21 (5), U5d).** The message writes take
a **`blocks`** in-port — a `MessageBlock[]` — and the host's commit is where a block becomes a
**form**: `checkMessageBlocks` gates the tree; `undeclaredBlockFunctions` refuses a function the
running document declares no action for (`HostScope.contributes` is the document's
`contributes`, set by `runSpec`); a block naming another spec's identity on purpose is held to the
installed declaration (`foreignBlockActions` → `listGenreActions`); `worldBlockFunctions` and the
same lookup refuse a `world` action; `stampBlockActions` writes the identity and `assignBlockIds`
the id; one `core:blocks` part is appended (`messages/blocks.ts`). Then the **pinned** portrayals
(`HostScope.portrayals`, never re-resolved) answer for every block with an `addressee`: `ai` pushes
`{ payload, form }` onto `HostScope.addressed`, and `runSpec` dispatches each as
`core:event/form-addressed@1` **after `saveReceipt`** — through `dispatchSessionEvent`, with
`lineage: childLineage(this run)` and the parent's `io` and `signal` — and awaits the tree before
returning. A person or nobody: the block waits. Four things a host wired by hand should know:

- **Lineage is the executor's to stamp and the host's to enforce.** `RunOptions.lineage`
  (`RunLineage`: `parentRunId` · `rootRunId` · `depth`) lands on the receipt; `saveReceipt` writes
  the three `pipeline_runs` columns (migration 0140); `runtime/lineage.ts` holds the per-root caps
  (`MAX_RUN_DEPTH = 4`, `MAX_RUN_DESCENDANTS = 16`), asked once per dispatch — by
  `dispatchSessionEvent` at the event door and by the `answer-form` commit at the fire door; a
  refusal is **receipted** (`refusalReceipt`, `sessionEvents.ts`) — a halted run row naming the
  cap, lineage filled, the routed spec named — never dropped. The fire door's refusal is written
  by `dispatchFires` **after the answer run's own row** (U5d review, S-b): the commit only records
  `refused` on the `PendingFire`, so the tree's rows land in dispatch order. A root releases its
  count when it finishes.
- **`answer-form@1` is a click — made at the commit, run after the receipt** (U5d review, W1/W2).
  Its commit (`host.ts`) reads the block off the row, checks the answer against
  `formAnswerSchema` (`formFireOf` / `checkValues`), routes the spec, asks the caps, chooses the
  child's run id and pushes a `PendingFire` onto `HostScope.fires`; it publishes `firedAction` and
  `firedRunId`, and every failure to make the fire — an answer naming no option, a form already
  answered, a cap — is a **halt** of the answer run, never a throw. `runSpec` then dispatches each
  fire through `fireAction` (`runtime/fireAction.ts` — the road `sessions:fireAction` also
  takes) **after `saveReceipt`**, outside any node timeout, with
  `actor: { userId: run owner, as: addressee }`, `lineage: childLineage(this run)`, the parent's
  `io` / `signal` / `sink` / `onStatus` / `onParked`, and the answer run's **pinned** `portrayals`
  (W3). `fireAction` admits an `as` fire only for a block whose addressee is that reference and
  whose portrayal — pinned, for a dispatched fire; resolved now, for a click — is `ai`; a person's
  fire on the same block only when they portray the addressee, or when nobody does and they are
  the owner (W4); normalises a `choices` press to `{ choice }` and checks a `form` press's values
  (W5); refuses a `world` action either way, by the pressed declaration or by the routed spec's
  governing action on the legacy branch (W6); refuses a form already `answered` (W7); and, once
  the action's run lands, records `form-answered` in `session_changes` with `answeredBy`, stamps
  `answered` on the stored block (`markFormAnswered`) and announces the row with its parts. **Every
  fire leaves a row under `firedRunId`** (W-a): a refusal is a halt, a fire stopped before it
  started is `cancelled` with the stop's actor and reason, a fire that threw is a halt on the
  error's sentence — `dispatchFires` writes each through `refusalReceipt`, never only a log line.
  The outlet may be placed only under `core:inlet/form-addressed@1` — `validate()` refuses it
  elsewhere and the host checks `HostScope.inletDefinitionId`. Its `timeoutMs` is a write's order
  of magnitude (30 s, S-a: the commit does database work of its own, and under PGlite contention
  five seconds turned a halt into a timeout `err`).
- **The host stamps the channel head, and the door compares against it** (R-15 *Staleness and
  order*, U5f). `writeBlocks` reads `stalenessHead(db, sessionId, row.channel, row.id)` — the
  greatest `session_messages.id` on the row's exact channel string, lane-scoped, among rows that
  are not **answers to a form on that row** — and stamps it on every `choices` / `form` block as
  `head` (`assignBlockHead`; a head a spec wrote is replaced, and the validator names a malformed
  one as host-owned). An answer's row is known by `metadata.answersForm: { messageId, blockId }`,
  which the `create-message` commit stamps from `HostScope.answersForm` — set by `fireAction` on
  the run it starts for a press (`SpecRunRequest.answersForm`), never taken from a spec's or a
  client's `metadata` — so an answer does not move the conversation on from the row it answers
  and several questions on one row are each answerable. `channelHead` stays the newest-row read
  behind `itemValuesFor`'s `item.isNewest`. Staleness is never stored: `fireAction`, after the
  `answered` refusal and before the audience, reads the staleness head now and refuses a press where
  `isFormStale(block, headNow)` — `!answered && head != null && headNow > head` — with
  `FORM_OVERTAKEN` (*That question was overtaken — the conversation moved on before it was
  answered.*); a dispatched fire meets the same door and `dispatchFires` receipts it as a halt on
  that sentence. The first stale press records `core:event/form-superseded@1` `{ messageId,
  blockId }` in `session_changes` (`recordFormSuperseded`, once per block), so the next reply's
  inlet learns the question lapsed. Deleted rows do not count toward the head; hidden ones do; a
  block with no `head` (pre-U5f) is never stale; answered beats stale. The client mirrors the rule
  (`utils/formAnswer.ts` `staleOf` over the list it holds) and collapses the block.
- **A parked run releases its caller** (U5d review, R-b). `createReviewer` takes `onParked`, told
  once per gate after the card is pushed; `runSpec` relays it as `SpecRunRequest.onParked` and
  hands it to every child. `fireAction` races its run against its own park: the moment its gate
  parks it answers `{ kind: 'parked', runId, specId }`, the run keeps its handle (the gate is
  unchanged — stop, decide, resolve as before), and how it ends arrives on
  `FireActionRequest.onSettled` (`ran` / `stopped` / `failed`). A park in a descendant does not
  park the caller: the descendant's own `fireAction` returns, the tree unwinds, and the fact rides
  the `ran` outcome's `parked` list. `sessions:fireAction` answers `parked: true` either way
  and releases the session's generation lock with the ack; the settled run's terminal frame, relist
  and answer arrive later as pushes.
- **`validate()` runs at the instance's publish** (W9): `saveDocument` refuses a document with
  any error-severity finding (`assertValidates`), with the finding's sentence. The shipped catalog
  is clean; a host that wants a document past that door has no door to go through. One shipped
  spec that stopped validating would be a boot failure by design — the zero-error test over the
  catalog is the guard. A transcript wired as candidates (`messages@1` into a
  `context-candidates@1` port) is a **warning** naming the `band` port, never an error (R-a):
  `messages@1` is no longer assignable to `context-candidates@1`, because the host drops rows
  handed as candidates rather than ranking them. A reference wired into a *field* of a port is
  held to nothing where the port is one a spec assembles from parts (`json@1`,
  `template-context@1`) and to the port's shape everywhere else (S-c).
- **Display text is enforced at every publish door (R-20; U5i, ruled 2026-09-17).** Every
  author-facing string is `I18n = string | LocaleMap` — a bare string is `en` — and one check,
  `i18nFindings`, refuses a map without `en`, a blank `en` or bare string, and any other value,
  each with a sentence naming the field and the fix. The doors: `register()` (a definition's
  `i18n`, its slots' `description` / prompt `fields` / `schema`, script points, a shape's
  `fields` and `panels[].title`, an entry shape's `fields`), `genre()`, `envoyFindings`,
  `defineAttributeSlot*` / `defineAttributeSheet*`, `defineScriptKind`, the value toolkit,
  `config()` / `preset()` / `announce.build()`, `defineExtension` and the packager
  (`E_MANIFEST_DISPLAY_TEXT`), an action's label and an enabled-when's reason, `validate()`
  (`law: 'R-20'`: presets, the carried genre's name / description / envoys / shape) — and so the
  host's publish through `saveDocument` — and the host's plugin install
  (`manifestDisplayTextFindings`, `plugins/store.ts`). `ctx.status` drops a malformed status
  with a receipt note, never a halt. Readers resolve through `i18nText(v, language)` — the SDK's
  one resolver; the app's `i18nTextIn` wraps it, and widget titles are resolved at
  `$lib/shared/widgets/types`. Exempt: slash names, receipt notes, form-block content, message
  content, permission ids.
- **Review fields are the general rule.** `reviewFieldsFinding` is asked at `register()`: an
  effectful definition without `review.fields` still registers, but the omission is kept
  (`definitionFindings`) and `validate()` warns on every node bound to it; every core definition
  declares its fields. A host reading `definitionFindings()` at boot can say so once.
- **The line is enforced everywhere an author is.** `ActionDecl.effects` (`fiction` | `world`);
  `actionFindings` refuses a `world` action's venue outside `WORLD_ACTION_VENUES` or an `act`
  outside `WORLD_ACTION_ACTORS` — at construction, in `validate()`, in `announce.build()`, and at
  the host's publish (`saveDocument` runs `actionDocumentFindings`).
- **Enabled-when is the door's second verdict (R-15; U5e, 2026-09-17).** The host builds one
  **published values** document per listing and per fire (`entities/publishedValues.ts`:
  `session.generating`, `session.fields`, the resolver's `state`, and `item` for the message a
  press names — `shared/actions/itemValues.ts` is the shape the client builds per row) and
  evaluates each action's effective predicate set with the SDK's `evaluateEnabledWhen`: the
  session's binding override (`pipeline_bindings.enabled_when` on the action's identity, set
  through `sessions:bindFunction` with a `subject`), else the declaration's `enabledWhen` (an
  explicit `[]` opts out of the genre's default), else the genre's default for that identity
  (`genreEnabledWhen`; plans/31 V2 — the identity `<spec slug>#<key>` is the one key). `fireAction`
  asks `enablementVerdict` after the audience and before routing — a form's answer and a
  hand-made `sessions:fireAction` alike — and refuses with the failing predicate's `reason`
  rendered in the actor's language; the core verb handlers ask the same through `verbRefusal`'s
  `door`, and the floors no genre can switch off (edit, branch) through `verbEnablementRefusal`
  (`messages/verbs.ts`). The listing (`listSessionActions`) answers `enabled` / `reason` for
  what it could judge and hands the `item.*` predicates to the client as `itemPredicates`; both
  read `enablementOf`, so a grey control and a refusal never disagree. When a root run starts
  and again when it ends the host pushes `sessions:actions` to the session's users
  (`sessions/actionsPush.ts`) — the server, never the client, decides when a verdict has moved. The junction clause reads the same `readPath` / `predicateHolds`
  (`predicates.ts`).

**Statuses (R-19, R-21, U5h).** Every kind's ctx carries `ctx.status({ i18n, vars })` — a query
says *{speaker} is thinking*, `assemble` says *{speaker} is composing*, the oracle says *{speaker}
is typing* before its call; a draft inside an `each` says *summarising part {n} of {total}* from
`ctx.iteration` (`{ index, count? }`, present only inside an `each` or `loop` body). The text is a
locale map with `{vars}`; the client resolves the locale. `{speaker}` is the ONE variable the host
fills (`HOST_FILLED_STATUS_VARS`) — handlers stay blind to who is speaking. Optional on the type
the way `reportCacheUsage` is, so a hand-built ctx in a test still compiles: a handler calls it as
`ctx.status?.(…)`, and the executor always supplies it. The executor hands each
*change* to the host (`RunOptions.onStatus(nodeKey, text)`; a repeat is not a change), keeps the
last one, and writes `Receipt.lastStatus` only when the run ends `halt`, `err` or `cancelled` —
never on `ok`, never on a preview's halt, never as a node row (F34). A status is not declared: no
definition moved. Core's half is `runtime/runStatus.ts` — the relay that fills `{speaker}` from the
run's speaker, writes the live row's `generation_status`, tells the run registry and the session's
users (`sessions:runStatus`), and feeds the caller's own frame (`SpecRunRequest.onStatus`); the LLM
queue's `queued` / `loading` are host statuses through the same relay, shown only once they last.
⏳ A process-transport plugin hook receives `{ input }` only today; `ctx.status` is core-handler
only until the sandbox ctx is projected (U6).

### Step 7 — Debug preview replaces the token estimator (U19d)

Chat debug mode already estimates the next request. Point it at `previewTarget` +
`renderPreview`: the run executes and halts at the first Provider **on the spine**, and
reports what would have been sent.

The property that makes this worth doing is that the preview _is_ the payload — same
allocation, same wire formatting, same measurement — so the estimate cannot drift from the
send.

A preview is a **dry run** (09-B B4, R-21 (1)): every outlet before the halt still runs — the
reply's placeholder outlet included — but `ctx.commit` returns a synthetic id and reaches no
host, the node row is marked `dry`, and the event the write would have caused is recorded
flagged rather than emitted. `RunOptions.dry` defaults to the preview flag
(`dry = opts.dry ?? !!opts.preview`); a host may pass it alone to run a document to the end
and write nothing.

⚠ This is a semantic of `preview` itself, not of the shipped specs: a `preview: { atNode }`
on ANY document performs none of the writes before `atNode`, and there is no per-outlet
exemption. For a plugin author that means an outlet placed before the node a preview halts at
runs — its binding is invoked, its payload is formed, the review gate sees it — and commits a
synthetic id (`dry:<nodeKey>`) that downstream nodes read as they would a real one. A spec
that needs a real row to exist during a preview is a design to reconsider, not a flag to flip;
`dry: false` on a preview is the host's decision, never the document's.

**Proves it:** **C13** — the previewed payload is byte-identical to the sent one — and the
app's `replyRoad.int.test.ts`, which adds that the estimate leaves zero rows.

### Step 8 — Plugins (U14, U10, U21)

Install reads the manifest and documents. `checkInstall` gates it; `cannotDo(manifest)`
generates the negative list for the consent screen — generated, so it cannot flatter.
Permissions are compiled from usage at build time and **re-checked at runtime** against the
admin's grants.

Since R-4 (2026-09-16) the inlet lock is a pipeline's one subscription, so the packager emits
`event:<inlet lock>` for **every pipeline with an `input.event`** — a package that answers
`core:event/message-respond@1` lists `event:core:event/message-respond@1` whether or not it
registers an event listener. Before the fold only `.on()` subscriptions surfaced, and a
pipeline that ran on every primary turn listed nothing; a manifest rebuilt against this
release therefore carries one permission per locked pipeline that its previous build did
not. Preset `bindings` are keyed by event **id** (`core:event/message-respond@1`), never by
bare name; `announce.build()` refuses a bare key, and `syncPluginPresets` skips and reports one
it finds in an installed manifest, logging once per preset — never written.

A plugin's session widgets declare per-instance settings the same way core's do: a
`settings` schema on `WidgetDecl` (`sdk/src/layout.ts`), written in the SDK's one field
language — the `FieldDecl` a node's `params` use, so `SchemaForm` renders it with no UI work
by the author. Core adds `title` and `lane` to every widget and reserves those two keys; a
field declared in the `behaviour` group appears behind the settings card's advanced
disclosure, and a field declared nowhere is never shown. Values are stored as deviations from
the declared defaults, per widget instance, so a default changed in a later version reaches
every instance that has not overridden it. A field no longer declared has its stored values
pruned at boot (`db/widgetSettings.ts`) — ⏳ for core's widgets only; nothing yet calls the
prune for a plugin's on install or update. The effective settings reach the widget through the
data contract's `settings.v1` section — natively on `ctx`, and over the port as
`{ t: "settings" }` for a frame.

**What a hook's `ctx` carries is decided by the kind of hook (plans/29 R-3).** One table,
`plugins/hookCtx.ts`, read by both sandboxes, by the boot and by the install probe:

| kind                                       | `storage` | `fetch` |
| ------------------------------------------ | --------- | ------- |
| `task`, `chain-link`                       | —         | —       |
| `query`, `outlet`, `event`, `lifecycle`    | yes       | —       |
| `oracle`                                   | yes       | yes     |

A task is pure (F11) and a chain link is a script — the in-app script host hands one
`{ random, log }` and a plugin's link gets the same; the four storage kinds get an extension's
own namespaced rows and nothing that reaches the network (F32); an oracle is the one kind that
calls out. Every `callHook` names its kind (`CallOptions.kind` → `InvokeOptions.kind`), a call
without one throws, and a member the kind is not granted is *absent* from `ctx` — never a stub
that refuses — so `Object.keys(ctx)` is the whole answer. The boot runs the SDK's
`assertHookSurface` over the event and lifecycle rows and holds the two pure rows to carrying
neither member; the install-time conformance probe runs each hook the manifest binds to a
`task` definition and fails the bundle, naming R-3/F11, when its failure changes once `storage`
and `fetch` appear. A host integrating the SDK owns this table, and the conformance kit reaches
it: **C25** asks the host for `hookCtxKeys(kind)` and holds each kind to `hookCtxKeysFor` from
`@serene-pub/sdk/testing`, with `read`/`call`/`commit` reaching no handler. The host's own
sandbox tests still prove the dispatch; the kit proves the table.

### Step 9 — Retire the old tables (0.7–0.8)

Retained means frozen (`08 §5a`): the old tables keep working and stop changing. Drop them
only when parity has held across a release and nothing references them. Two clocks, and the
slower one is the user's.

---

## 1b. Tool loops

A **tool** is a named, read-only function a model may ask for by name mid-run.
Canonically it is a plugin's sandboxed hook; core ships seven. The three nodes
around it are deliberately small, and two of the three are pure — what makes an
agentic turn expressible is the `loop` block, not a clever node.

### The reference

`core:spec/tool-loop` in `@serene-pub/core-catalog` (`toolLoopSpec()`, `src/shared/toolLoop.ts`)
is the worked example. Read it; this section is the argument, not the API. It is exported, not
seeded: since 2026-10-05 it is not in `CORE_SPECS`, so no install lists it as a pipeline, and a
package that wants one publishes its own.

```
input → history ─┐
      → tools ───┴→ advertise → loop( results → prompt → generate → parse → tool )
                                       ↑                                      │
                                       └────────── $.agent.values ────────────┘
                                                                    → answer → save
```

- **`core:query/available-tools@1`** — what this install can offer, `{ name,
  description, parameters }` each, `parameters` as JSON Schema. A Query and not
  a literal on the spec, because which extensions are enabled is not a property
  of a pipeline.
- **`core:task/advertise-tools@1`** — publishes **both doors**: `prompt` (the
  declarations written into the context, for models that never heard of tools)
  and `native` (the list an API's own tool field takes). `style` picks which one
  `main` carries.
- **`core:oracle/generate-text@1`** — the ordinary generate step. Swap it for
  **`core:oracle/generate-with-tools@1`** to take the native door: same node
  with a `tools` in-port and a `toolCall` out-port. A second pin rather than two
  more ports, because the first is published and frozen.
- **`core:task/parse-tool-call@1`** — reads the fenced convention back out of
  the reply as `{ tool, args } | null`, and hands on the prose with the block
  stripped. **Not used on the native door**: the API already parsed it, and
  parsing it again would be a second reading of one answer.
- **`core:oracle/run-tool@1`** — runs it. An oracle because a tool reads the
  session or reaches an extension's sandbox, which is `effects: 'external'`
  exactly.
- **`core:task/join-text@1`** — the reduce a repeated block has always needed:
  `map` and `loop` publish a **list**, and every write takes a scalar.

### The exit is a null call, not an error

`parse-tool-call` publishes `null` when the model answered instead of asking,
and that is the loop's predicate. A reply with no call is the model being done —
so an unparseable block, an unknown name and plain prose all read as "finished",
never as a failure. `run-tool` on a null call runs nothing and passes the prose
through on `answer`.

### Tool resolution order

1. **An enabled extension's tool hook.** `manifest.tools: { '<toolName>': {
   hook, description, parameters } }` — the sibling of `hookKinds` (a script
   link's hook) and `nodeDefinitions` (a node's), and read the same way: the stored
   manifest is the one source of truth, never a convention guessed from an id.
   The hook runs through the sandbox that already exists, so permissions, the
   deadline, the seeded RNG and the invocation log all apply.
2. **A core tool** (`runtime/tools/coreTools.ts`) — four reads, `search_entries`,
   `get_entry`, `grep_transcript`, `read_summary`, all reading the session through
   the host's own enumerated read, so the hidden-message convention and the
   character-lore privacy gate apply without a tool knowing they exist; and three
   that *ask*, `set_state`, `give_item`, `take_item` (`stateTools.ts`), which
   only ever file a proposal (§1c).
3. **Refused, by name.** Not "no result": a model told "unknown tool" with no
   name asks for the same one again.

Extensions come first deliberately. A plugin shipping `get_entry` has written a
better one for its own world model than core's, and core silently winning would
make it unreachable with nothing to report it.

An error is a **result**, never a throw: `main` is `{ tool, error }` and `text`
renders it, so the model reads what went wrong and tries something else. A throw
would end the run at the one moment the agent could have recovered. **A tool may
not write** — a write inside a repeating block is N writes, which the validator
refuses on the spine (F7) and which a writing tool would smuggle past it. The three
state tools do not break this: what they create is a request with no effect on any
value until a person accepts it.

### The carry

An iteration cannot reference a node declared after it — the scope makes a
back-edge unwritable (F9) — so the results of the passes before it arrive by the
one address declared *before* the body: the block's own accumulating output,
`$.agent.values`. Everything else stays private: each iteration runs in its own
child scope, so a loop and a parallel map remain the same construct.

That is why the prompt node is **inside** the loop. A loop whose prompt never
changed would ask the same question until it hit its ceiling.

### Receipts, ceilings and cancellation

Every pass is receipted as its own step with its `iteration` index — per-step
timings, per-step review, per-step budget. That is the whole argument for
putting the loop on the spine instead of inside one opaque provider hook.

The block records **why it stopped**, as a fact and not a sentence:

```ts
receipt.loops // [{ blockId: 'agent', iterations: 3, stopped: 'predicate' }]
```

`predicate` — the model stopped asking. `ceiling` — the declared `max` ended it,
so the work may be unfinished. `interrupted` — the body halted, errored or was
cancelled, and the run's own outcome says which. A truncated loop that returns
`ok` is otherwise indistinguishable from a finished one.

`max` is **mandatory** on a loop: an unbounded repeat is the likeliest source of
a surprise bill in the system, and for a loop it is also the only thing between
a bad predicate and a run that never ends. Cancellation is checked between
iterations, on the executor's ordinary one-source rule — a tool already in
flight finishes, and the loop stops before the next pass.

### The native door on the wire

`advertise-tools` with `style: 'native'`, wired into
`core:oracle/generate-with-tools@1`, reaches the request as the field each
service calls it: `tools` (functions) on OpenAI-chat, `tools` with
`input_schema` on Anthropic, `tools` on Ollama's `/api/chat`. The adapter reads
the call back off the structured field, so `toolCall` arrives as data.

Three rules the adapters share:

- **No tools means no `tools` key**, never `tools: []`. Servers differ on the
  empty array — some reject it, some switch tool mode on for it — so every
  pipeline that is not a tool loop would start paying for a feature it never
  asked for.
- **The first call only.** One tool per iteration, receipted as one step; a
  batch collapsed into one node would lose exactly the per-step accounting the
  loop exists to provide.
- **Refuse rather than strip.** A connection whose `tools` capability is off, or
  whose adapter has no tool code, refuses a request carrying declarations. A
  model that was never offered a tool and a model that declined one return the
  same empty answer, so a silently stripped request reads as the model choosing
  not to call.

KoboldCPP, llama.cpp and LM Studio stay on the prompt door — which is what
`tools: "emulated"` means in the adapter manifest: a thing this app supplies
over a backend that never heard of tools, needing no adapter code at all.

---

## 1c. Attribute slots — declaring a stat

A **stat** is a typed value about one owner that changes: health, mood, weather. Core owns the
six *types* — whole number with optional bounds, one-of-a-set, text, on/off, a list, and derived —
and nobody adds a seventh. What a genre or a plugin declares is a **definition** composed from those:

```ts
import { defineAttributeSlot, definePluginAttributeSlot, derivations } from '@serene-pub/sdk'

const hp = defineAttributeSlot('acme.crawl:slot/hp@1', {
  type: 'integer',
  label: { en: 'Health' },                       // what a person reads — free to copyedit
  description: { en: 'How much punishment they can take.' },
  descriptor: 'Current health out of the maximum; zero means down.',  // what the MODEL reads
  appliesTo: ['cast'],                           // 'cast' | 'world' | 'location'
  config: { min: 0, max: 20 },                   // what attaching decides, by default
  default: 20,                                   // what a read falls back to
})

genre('acme.crawl:genre/dungeon', { name: …, family: 'crawl', slots: [hp] })
```

`definePluginAttributeSlot(pluginId, id, props)` is the same door for an extension, minus the ability to
claim the `core:` namespace. Read the registry with `getAttributeSlot(id)` and `attributeSlots()`.

Three rules worth knowing before you write one:

- **`descriptor` is contract, `label` and `description` are not.** The first is what the model
  is told this slot means, so editing it changes every prompt the slot appears in: it is inside
  the declaration's content hash and changing it means `@N+1`. The other two are stripped from
  the hash, so renaming a slot in the UI is free.
- **A declaration says what the slot *is*; attaching says what it is *here*.** `config` is the
  base — "integer with a maximum" — and a card, a world or a session each store only the keys
  they *change*. A value is validated against the configuration in force for its own owner, so
  35 is refused on a 20-cap character and accepted on a 40-cap one.
- **Derived slots are never written.** `type: 'derived'` names one of core's derivations
  — `derivations.age` with the slot it reads (`config.from`), or `derivations.liquid` with a
  LiquidJS expression in the declaration's `derive`. There is nothing to store and nothing that
  can go stale.

An item is a lorebook entry (`core:entry/item@1`), so it keeps its prose, keywords and
retrieval; what somebody carries is the `inventory` list stat (`core:slot/inventory@1`), whose
items are references to those entries with a held count. Declaring an `items: text` slot is
the one modelling mistake this vocabulary exists to prevent.

On the pipeline side, `core:query/session-state@1` publishes the resolved state
(`{ world, cast }`) and `core:task/set-state@1` changes it. Set state defaults to
`mode: 'propose'`, which holds the change for a person to accept — the review gate a model's
writes always pass through. The three core tools (`set_state`, `give_item`, `take_item`)
likewise only ever propose.

**The state version and `base`** (plans/29 R-15 *Staleness and order*; plans/30 U5f). The host
keeps `sessions.state_version`, moved by one for every row `setValue` writes (items are inventory
list changes since attributes phase 3b) —
inside the write's transaction, under `pg_advisory_xact_lock(hashtext('stateVersion'),
sessionId)` — and stamped on the row (`attribute_values.state_version`). `session-state@1` publishes it as `version` (and inside
`state` as `state.version`); `resolve-state-changes@1` takes it on an optional **`base`** in-port
and passes it through onto every resolved change; `set-state@1` takes `base` too (a change's own
`base` wins over the node's). In `apply` mode a delta whose target's in-force row landed after
the base is put on the new **`refused`** out-port — *"<slot> changed since this run read it
(v<base> → v<now>); resolve-state-changes must rebase on the next turn"* — and the untouched
ones apply (`applyChange` → `movedSinceBase`, `state/write.ts`); a run never re-enters an
earlier node, the next turn re-resolves. In `propose` mode
the base lands in `state_proposals.base_version` (the caller's, else the version at propose
time), and the accept judges the same way: untouched since → applied (the rebase); moved →
`status: 'superseded'`, nothing applied, `movedSlots` on the `state:decide` reply;
`supersededProposals` lists them beside the pending rows. The Adventure keeper graphs wire `base: $.gather.state.read.version` into the resolver and both `set-state`
arms.

**🚧 Lorebook stats and the stat trail (2026-09-27).** `core:query/lorebook-state@1` reads a
lorebook's durable stats — `{ lorebookId, branchId, slots, world, cast, locations }`, cast keyed
by cast member id — with no session needed (optional `owner` port, `slotIds` param).
`core:query/stat-trail@1` (the *stat trail*, its document on the `trail` port) lists one slot's values over time for one owner (`params.slotId`,
`mode: 'both' | 'messages' | 'timeline'`, `last`; `since: { messageId?, date? }` port): points
`{ value, layer: 'session' | 'timeline', anchor: { messageId } | { historyEntryId, date },
provenance: { updatedBy, sessionId, messageId, sceneId, note, createdAt } }`, the timeline ordered
by story date under the shared `compareDates`. Both are Queries over `ctx.read` (host tables
`lorebook_state`, `stat_trail`; core's `state/lorebookState.ts`, `state/statTrail.ts`); the host
answers only for the scope session's lorebook or one the run's scope grants
(`HostScope.lorebookId` — ⏳ nothing grants one yet), and refuses any other with
`HostScopeError` (`lorebookInScope`, `host.ts`). 🚧 They read the scope session's line and moment,
or with no session the book's most recently used line at the head; on a branch, main's dated
values count only up to the fork date. Optional in-ports override it: `branch` (`'main' |
'mostRecent' | 'session' | <branch id>`), `at` (`'head' | { year, month?, day? }`), `forkCut`
(`false` reads all of main); a branch of another book is refused. Both documents add `moment` and
`forkedAt`.

---

## 1d. Envoys — a speaker a genre (or an action) brings with it

An **envoy** (plans/29 R-18, R-21 (6); U5g) is a cast member that exists nowhere in the
library: the Guide genre's mascot, a dice plugin's "Dice Master". Two places declare one, and
there is no third — no API adds an envoy to another genre and no user authors one:

```ts
import { genre, slot } from '@serene-pub/sdk'

const guide = genre('acme:genre/guide', {
  name: { en: 'Guide' }, family: 'assistant',
  shape: { characters: { min: 0, max: 0 }, personas: { min: 0, max: 1 } },
  envoys: [{
    key: 'mascot',                          // the slug: `envoy:mascot`, config address `envoy:mascot`
    name: { en: 'Guide' },                  // a locale map with `en` — refused otherwise
    description: { en: '…' },
    image: 'data:image/svg+xml;utf8,…',     // ⏳ a URL or data: URI until a package can ship an asset
    prompts: { systemPrompt: '…' },         // the context builder's own prompt fields
    default: true,                          // seated on every new session, no choice (at most one)
    speaks: 'in-turn',                      // the default for a genre's; `on-action` never takes a turn
  }],
  events: { … },
})

// On a contributed action: `envoy:<plugin>.<key>`, `speaks: 'on-action'` by construction —
// the speaker the action's results post as. `in-turn` is refused at publish.
contributes: { actions: [{ key: 'roll', …, envoy: { key: 'master', name: { en: 'Dice Master' } } }] }
```

`genre()` refuses a duplicate key, two defaults, a name without `en`, a dotted key (a dot is
an action's namespace, so a genre's key and an action's slug can never collide), and an
`image` that is neither a `data:image/…` URI nor an `http(s)://` URL. The envoys are part of
the genre's declaration and of the create spec's `meta.genre`, so a changed envoy is a
changed hash. The host re-runs the same findings where a document lands as rows
(`boot/store.ts` `saveDocument`, which plugin install publishes through), so a plugin's
genre — which `genre()` never saw — is refused with the same sentences there, and a second
spec of one namespace claiming an action envoy's key is refused at the pointer move
(`assertActionEnvoyKeysFree`).

**Its data is configuration, not a schema.** A pipeline reads the envoy's instructions with
`prompts: slot.prompts({ envoy: 'mascot' })` on the context builder; the compiler checks the
spec's genre declares the key and resolves it to the address `envoy:mascot`, and the executor
resolves that address through the ordinary chain (`resolveConfig` is handed
`envoyConfigKeysOf(doc)` beside the nodes and clauses). The host's job is the projection:
`envoyPromptsSlotFor(envoy)` is the slot declaration — `parameters`, named `prompts`, the
genre's text as each field's default — which the app's `declarations()` emits at
`envoy:<key>` for every envoy a spec references, so the panel renders it as its own step
(**Envoy · Guide**), `world.ts` projects the declaration at `author`, and a deviation an
administrator writes lands at the same address the run resolves. `assemble`'s own
`slot.prompts({ node: 'context' })` is one hop — it reads the config stored at `context`'s
address, where an envoy-addressed builder keeps nothing — so the envoy's text reaches the
story string through `templateContext`, which the builder resolved and `assemble` spreads
over the raw slot.

**Seating and speaking.** A seat is a cast row with `envoy_slug` and no `character_id`
(`session_characters`, migration 0138; `seatDefaultEnvoys` on `sessions:create`,
`sessions:setEnvoySeat` from the Edit Session form, `PresetDefaults.envoys` to pre-seat). The
cast read carries `envoys` (declaration + `position`, `removedAt`), so the turn strategies
offer an `in-turn` envoy beside the characters and never an `on-action` one; the resolver
answers `ai` for a slug the session's genre or an installed action declares and `none`
otherwise (`declaredEnvoys` is the one reader). The inlet's `speaker` carries `envoy:<slug>`
with `characterId: null`; `create-message@1` takes `speaker` and stores it as
`metadata.speaker` — the row's only identity, since there is no row to name — and
`build-template-context@1` takes `speaker` and compiles the envoy's card (name, description
off the declaration) where a cast member's would be, through the `speakerName` /
`speakerCharacter` seam a side character already uses.

**Proves it:** SDK `envoys.test.ts`; the app's `envoyRoad.int.test.ts` (a guide session seats
the mascot, the reply runs as it end to end, the panel's deviation reaches the wire byte for
byte) and `envoySeatMigration.int.test.ts`.

---

## 1e. Who speaks — the turn order is state, written by events

Since the turn-order work (PLAN-turn-order, built 2026-09-21→24; canon at A9) **nobody decides
who speaks inside a reply**. Each genre has its own turn-order pipeline
(`core:spec/<genre>-turn-order`), bound by the genre's presets to every event that can change
whose turn it is (`message-completed`, edits, deletions, cast and settings changes, …). It
runs on the session's event queue after the write that caused it, **writes no message**, and
writes the session's prepared turns with `core:outlet/set-turn-order@1` into
`sessions.metadata.turnOrder` (`TurnOrderV1`). Its steps are the rules path — **turn pool**
(who may be seated) → **turn orderer** (`turn-mentioned`: a mention moves a character up) →
**turn strategy** (`turn-round-robin` by default; a swappable node) — or, under the genre field
`turnMode: model`, the **turn advise** oracle.

Everything else **reads** that state and never recomputes it:

- the `sessions:turnOrder` push (on write, and alongside `sessions:view`) feeds the composer's
  line and the turn picker; `who.next` and the previews read the stored head;
- **Continue** and the picker **fire a turn** (`sessions:fireTurn` → `fireTurnEntry`): the
  entry's subject is dispatched with its `ref` as the explicit pick, so the reply run is told
  its speaker and the placeholder is made for them; a person's entry is never fired;
- **auto-advance** is a core listener on `turn-order-changed` (never a pipeline): `off`,
  `next` (once per send) or `round` (continue while the event's cause is an automatic run's
  own — `runReply` → `runTurn` → `runSpec` forwards `auto`, so every write the run makes carries
  `cause.auto` — until a person's entry, an empty order or `MAX_AUTO_ADVANCE_PER_SEND`);
- a run's own data events ride its tree on the **listener lane** (R65, `listenerLineage`):
  no depth, no descendant budget, their own echo cap, so a pipeline that answers its own write
  parks for the owner instead of looping.

A session's strategy choice is a **swap** (`pipeline_node_rebinds`, set with
`sessions:setNodeRebind`, shown as a pipeline card via `sessions:pipelineCards`); a plugin
offers alternatives as swap contributions, switchable on the genre hub.

**Proves it:** `sessions.turnOrder.int.test.ts` and `turnOrder.write.int.test.ts` (the state
and its write rule), `fireTurn.int.test.ts` (firing, picks, the person rule),
`autoAdvance.int.test.ts` (off / next / round, the cap), `turnAdvise.int.test.ts` (the model
path and rebinds), `lineage.test.ts` (the lane), `eventMapCheck.int.test.ts` (every loop has
a termination policy), `envoyRoad.int.test.ts`.

---

## 2. Seams that will need work — known, not discovered

These are places where the draft is deliberately minimal. Each one is a substitution, not a
redesign, and the tests around them pin the contract rather than the implementation.

| seam                       | what the draft has                      | what core needs                                                                                                                                                      |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jinja2 engine**          | ~200 lines: `{{ a.b }}` and `{% for %}` | a real Jinja2. Handlebars and Liquid already show the shape: the SDK declares them (`src/engines.ts`) and the host supplies the renderer, so this is registering one, not rewriting callers |
| **The packager's scanner** | a dependency-free lexical scan          | a real TypeScript parser. The scan is correct for the shapes it recognises and is explicitly commented as a placeholder — swap `scanSource` and keep `compilePlugin` |
| **Sidecars**               | no transport                            | `jsonrpc-stdio@1` (U13)                                                                                                                                              |

A template slot may name **one** language (`engine: handlebars.id`) or the **set** it accepts (`acceptedEngines: [handlebars.id, liquid.id]`, most-preferred first — the first entry is what a new template in that slot is written in, and the host offers the union of the accepted pools in one picker); both spellings stay valid, so declare `acceptedEngines` only when your slot genuinely renders more than one.

---

## 2a. One verdict per law — core's doors quote the SDK's verdicts (01 §13, plans/31 V4)

A rule has exactly one verdict function, registered with the SDK (`defineVerdict`,
`verdicts()`); every door — construction, the registry, `validate()`, publish, the run, the
fire, the write, a listing — calls it and quotes its sentence. Core's doors are the app's
half of that: `fireAction` hears `stalenessVerdict`, `effectsLineVerdict` (as a `press`)
and `audienceVerdict` (through `sessionActions.audienceVerdict`, which resolves the
portrayals and hands in the item rule's answer); `runtime/host.ts` hears `effectsLineVerdict`
at the block write (`block`, and `identity` for a foreign declaration); `boot/bindingCompat.ts`
hears `provisionalVerdict` at the registry; the client, through core-catalog's
`conversation` module, hears `audienceVerdict` (`messageVerbState.notYoursToUse`) and
`stalenessVerdict` (`formAnswer.staleOf`). A door that compares `effects === "world"`,
recomputes staleness, or writes its own wording of a refusal is a defect — add the input kind
to the verdict instead. The kit's **C27** holds a host to this through `HostUnderTest.doors`;
⏳ the app host that answers it is plans/31 V5.

---

## 3. What "integrated" means, as a checklist

- [ ] `@serene-pub/conformance` runs in CI against core's executor, all 33 green
- [x] one real session turn runs as a pipeline end to end, from a real event
- [ ] the parity corpus is byte-identical over fixtures drawn from real sessions
- [ ] every existing user prompt config appears as a preset, or as a reported exception
- [ ] debug mode reads from the preview, and the preview matches the send
- [ ] a plugin built with `serene-pub build` installs, and one built against another
      release is refused with a message naming the drift
- [ ] the old tables still work, unchanged, and are scheduled rather than dropped

---

## 4. The pattern worth carrying over

Every implementation finding in this draft has been **at a seam between two documents**,
never inside one. Allocation versus wire formatting, the proposal id versus the row id,
template scope versus typed ports, the packager versus the manifest. Each was consistent in
both places and wrong between them.

So when integrating: the risky work is not any single unit. It is the joins — the place
where the config resolver meets the executor, where the preview meets the send, where the
migration meets the parity harness. Those are where to spend the fixtures.


---

## 5. Seam census — every extension point, its stability and the tests that run it

Moved here from the plugin-author guides: this is a core developer's table. Each **seam** is an
extension point the SDK declares. A row gives its **stability** (the TSDoc tag on the symbols that
declare it: `@public` is frozen for SDK 1.0, `@experimental` can still change), the **shipped
implementations** (core, the app or the CLI), and the **tests** that run each one, as
`file` › `test name` — `sdk-tests/…` in this repository, `serene-pub/…` in the app.

The rule (R37): a seam either has a working implementation or it is tagged `@experimental`; no
seam is frozen while it is empty. What falls short is listed under [Gaps](#5c-gaps).

`sdk-tests/extendingCensus.test.ts` reads every table below whose header starts `| Seam |`. It
fails when a named test file is missing or no longer declares the named test, so the census
cannot go stale. Rename a test, update its row here in the same change. (Section 2's table
uses a lowercase `seam` header so the census test does not read it.)

### 5a. The pipeline surface

| Seam | Stability | Shipped implementations | Tests that run them |
| --- | --- | --- | --- |
| **Node kinds**: `inlet` · `query` · `task` · `oracle` · `outlet`, and `entry` for entry types | `handler()` @public · `Kind` @experimental | Core's catalog ships definitions of every kind. A package's `task`, `query`, `oracle` and `outlet` definitions run through `handler()` in the sandbox. Only core ships inlets and entry types | *task*: `sdk-tests/pluginHarness.test.ts` › `a task is pure: neither storage nor fetch` · *query, outlet*: `sdk-tests/pluginHarness.test.ts` › `a query and an outlet get the extension’s own rows, and no network` · *oracle*: `sdk-tests/pluginHarness.test.ts` › `an oracle is the one kind that calls out` · *inlet*: `sdk-tests/messageVerbs.test.ts` › `each compiles clean, under its declared id, as one inlet straight into one outlet` · *entry*: `sdk-tests/entries.test.ts` › `an entry type is a registry row like any other, with kind entry` |
| **Provisional node definitions**: `core:oracle/speak@1` · `core:oracle/mcp-tool@1` · `core:oracle/mcp-resource@1` | `C.speak`, `C.mcpTool`, `C.mcpResource` @experimental, with `provisional: true` | **None.** They are declared and have no handler. `validate()` refuses a document that places one, and none of them can be a swap | `sdk-tests/rulings.test.ts` › `the three core definitions plans 14 and 28 own carry the flag, and no other core one does` · `sdk-tests/rulings.test.ts` › `a document that reached the executor anyway halts on the law, not on "no binding registered"` · `sdk-tests/modderPass.test.ts` › `a provisional definition cannot be a swap — it has no handler` |
| **Specs** (pipelines) | `spec()`, `pin()`, `slot()`, `use()` @public | Core's catalog specs. A package's own, under `pipelines` | *core*: `sdk-tests/coreCatalog.test.ts` › `the announcement builds — genres, pipelines, hooks validated as one package` · *package*: `sdk-tests/plugin.test.ts` › `it produces a manifest and the pipeline documents` |
| **Genres** | `genre()`, `GenreDecl` @public | Chat, Adventure, Guide and Lair; Whodunit and Writing Room are showcase plugins (`serene-pub-plugin-whodunit`, `serene-pub-plugin-writing-room`). A package's own genre | *every core genre*: `sdk-tests/coreCatalog.test.ts` › `exactly one create pipeline serves each genre, and one respond serves its turn` · *Lair*: `sdk-tests/lair.test.ts` › `nobody plays a person, and the dungeon is required` · *package*: `sdk-tests/modderPass.test.ts` › `a plugin genre gets its own spec from the same call — the id is taken, never derived` |
| **Presets** | `PresetInput` @experimental | Core's presets, one per genre. A package's own presets | `sdk-tests/presets.test.ts` › `three presets, one default, addressed by node key` · `sdk-tests/announce.test.ts` › `a preset leaving a required slot unbound refuses, and coverage says MISSING` |
| **Turn strategies** | `TurnStrategyPin`, `turnOrderSpec` @public · the pins (`C.turnRoundRobin`, …) @experimental | Round robin, round robin by user (`turn-user-split`), random, scripted, manual and narrator, plus the model path's advise oracle (`turn-advise`). A package's own strategy | *round robin*: `serene-pub/src/lib/server/pipelines/runtime/turnStrategies.test.ts` › `lists everyone who has not spoken since the person did, in candidate order` · *by user*: `serene-pub/src/lib/server/pipelines/runtime/turnStrategies.test.ts` › `narrows to the last sender's own candidates` · *random*: `serene-pub/src/lib/server/pipelines/runtime/turnStrategies.test.ts` › `prepares exactly one entry, and the same one for the same seed` · *scripted*: `serene-pub/src/lib/server/pipelines/runtime/turnStrategies.test.ts` › `takes the chain's order, marking what it changed` · *manual*: `serene-pub/src/lib/server/pipelines/runtime/turnStrategies.test.ts` › `manual prepares nothing, whatever the history` · *narrator*: `serene-pub/src/lib/server/pipelines/runtime/turnStrategies.test.ts` › `narrator prepares one entry in nobody's name after a person's line` · *advise*: `serene-pub/src/lib/server/pipelines/runtime/turnAdvise.int.test.ts` › `turnMode model: the model's order stands, via model, and the receipt names the oracle` · *package*: `sdk-tests/packageConformance.test.ts` › `C32 and C33 pass on a strategy that fits core’s chat turn order and behaves as a hook` |
| **Swaps**: definitions a person may put in a node's place | `expose.swaps`, `SwapContribution` @experimental | Chat's five turn-strategy swaps. A package's swap contributions onto another package's spec | `sdk-tests/modderPass.test.ts` › `swaps land on the built node and in the document as definition ids, pin never repeated` · `sdk-tests/modderPass.test.ts` › `announce().swaps() lands on the document, the definition as its id` · `serene-pub/src/lib/server/pipelines/runtime/turnAdvise.int.test.ts` › `the order names the strategy that ran — a pub-scope swap included (A7r)` |
| **Event listeners** | `eventListener()` @public · `EventListenerDecl` @experimental | The app's event host fans each core event out to the plugins listening for it | `serene-pub/src/lib/server/plugins/eventHost.test.ts` › `runs every subscriber of an event, in dispatch order` · `serene-pub/src/lib/server/plugins/eventHost.test.ts` › `keeps a thrown subscriber from touching its sibling's result` |
| **Package events** | `defineSessionEvent`, `ExtensionDecl.events` @experimental | A package's own session events, recorded by its pipelines and heard through the session-event inlet | `sdk-tests/customEvents.test.ts` › `registers it, so a lock may name it; core ids and bad ids are refused` · `sdk-tests/customEvents.test.ts` › `the receipt names the event the write caused; a write that wrote nothing causes nothing` |
| **Lifecycle callbacks** | `lifecycleCallback()`, `LIFECYCLE_MOMENTS`, `LifecycleMoment`, `LifecycleUpdateInput` @experimental | The host calls `startup` at boot, `enable` after a switch on, `disable` before a switch off, `update` on a replaced bundle's first run, `uninstall` before removal and `shutdown` during graceful shutdown. `load` has no caller (see [Gaps](#5c-gaps)). The compiler refuses `sidecarSpawn` and `scheduled` as not supported yet | `serene-pub/src/lib/server/plugins/SandboxManager.test.ts` › `calls a lifecycle hook as (input, ctx) on both backends` · `serene-pub/src/lib/server/plugins/SandboxManager.test.ts` › `lifecycle calls bypass the ready-gate and record as lifecycle` · *enable*: `serene-pub/src/lib/server/plugins/lifecycle.int.test.ts` › `enable fires once, after the switch, with an empty input` · *disable*: `serene-pub/src/lib/server/plugins/lifecycle.int.test.ts` › `disable fires once, before the switch, while still registered` · *update*: `serene-pub/src/lib/server/plugins/lifecycle.int.test.ts` › `update fires once, on the replaced bundle's first enable, with both versions` · *uninstall*: `serene-pub/src/lib/server/plugins/lifecycle.int.test.ts` › `uninstall fires once, before the row is removed` · *shutdown*: `serene-pub/src/lib/server/plugins/lifecycle.int.test.ts` › `shutdown fires once per registered plugin, then the manager is torn down` · *bounds*: `serene-pub/src/lib/server/plugins/lifecycle.int.test.ts` › `enable and disable still switch; uninstall still removes; shutdown still returns` · *dropped moments*: `sdk-tests/plugin.test.ts` › `a lifecycle callback for sidecarSpawn or scheduled is refused as not supported yet` |
| **Script kinds and hooks** | `defineScriptKind`, `ExtensionDecl.hooks` @experimental | Core's script kinds (`text/transform`, `candidates/filter`, …). A plugin's chain links, run through the one dispatch | `sdk-tests/scripts.test.ts` › `all eight are registered, and nothing else is` · `sdk-tests/scriptPoints.test.ts` › `a point declaring candidates/filter is offered to the applier as exactly that` · `serene-pub/src/lib/server/plugins/hookDispatch.test.ts` › `resolves owner + hook and forwards a success as a ScriptRunResult` |
| **Template engines** | `defineEngine` @experimental; a plugin's sandboxed engine is `templateEngines` on `defineExtension` @experimental | `plain` and `jinja2`. A package's own engine | *plain*: `sdk-tests/presets.test.ts` › `plain text is trivially exact — the reference implementation` · *jinja2*: `sdk-tests/presets.test.ts` › `jinja2 separates fixed literals from per-iteration literals` · *package*: `sdk-tests/presets.test.ts` › `an extension registers its own compiler and it renders` · `serene-pub/src/lib/server/plugins/engineHost.int.test.ts` › `registers at sync and renders through the sandbox` |
| **Plugin settings** | `defineSettings` @public | The generated settings form, and the host's settings store | `sdk-tests/settings.test.ts` › `the form layout groups in declaration order` · `serene-pub/src/lib/server/plugins/settingsHost.test.ts` › `encrypts a secret at rest and resolves plaintext only for the hook` |
| **Field controls** | `CONTROL_REGISTRY` @experimental | Boolean, number, text, select, ranking, weights, and the unknown-field fallback | `sdk-tests/generatedControls.test.ts` › `every FieldType either bridges to a value type or is handled by name` |
| **Declared permissions**: storage and network | `DeclaredPermissions` @experimental | The host's storage, which enforces the quota, and the host's fetch, which enforces the allowlist | *storage*: `serene-pub/src/lib/server/plugins/storageHost.test.ts` › `enforces the quota` · *network*: `serene-pub/src/lib/server/plugins/fetchHost.test.ts` › `matches an exact host on the default web ports only` · `sdk-tests/pluginHarness.test.ts` › `an oracle that declared no hosts is refused by name` |
| **Conformance package cases** C28–C33 | `conformPackage`, `manifestSeams` @experimental | C28 (event map), C29 (loops), C30 (clone parity), C31 (mounts), C32 (swap fit) and C33 (binding probe) | *C28, C29*: `sdk-tests/conformance.test.ts` › `95d · the six laws the showcase lanes hit each fail on a host that gets them wrong` · *C28*: `sdk-tests/eventMapLaws.test.ts` › `C28 refuses an uncaused event that is not a root, and an undeclared one` · *C29*: `sdk-tests/eventMapLaws.test.ts` › `C29: a loop needs one member with a termination policy; a chain needs none` · *C30*: `sdk-tests/packageConformance.test.ts` › `C30 parity passes on core’s messages widget against a clone, editing through the page’s field` · *C31*: `sdk-tests/packageConformance.test.ts` › `C31 mounts every listed module in a plugin’s box — clean modules pass, with the grants each names` · *C32, C33*: `sdk-tests/packageConformance.test.ts` › `C32 fails on a misfit, a node the host does not seat, and a definition the package does not declare` · `sdk-tests/packageConformance.test.ts` › `C33 fails on a strategy that returns a bare value, and on one with no handler, naming the probe` · `sdk-tests/packageConformance.test.ts` › `conformPackage runs the package cases only, and refuses a host case by name` |

### 5b. The UI surface

| Seam | Stability | Shipped implementations | Tests that run them |
| --- | --- | --- | --- |
| **Components** | `component()` @public · `ComponentDecl` @experimental | The components of core's widgets. A package's own components | `sdk-tests/hostElements.test.ts` › `a component declares slug, label, entry and framework — and no surface point (R25)` · `sdk-tests/hostElements.test.ts` › `a package's widget must name a component the package declares` |
| **Component frameworks** | `COMPONENT_FRAMEWORKS` @experimental · `svelteComponent` @public | `svelte` and `vanilla` (plain DOM) | *svelte*: `sdk-tests/componentCompile.test.ts` › `a scaffolded Svelte component compiles in-app from memory, with no renderer in it` · `sdk-tests/frozenArtifacts.test.ts` › `a frozen Svelte widget still reads its sections, asks a request, hears an event and invokes` · *vanilla*: `sdk-tests/componentBundle.test.ts` › `a vanilla scaffold builds too` · `sdk-tests/frozenArtifacts.test.ts` › `a frozen vanilla widget still restores its saved state, counts and saves` |
| **Renderer** (R23: out of sight behind the component client) | `guardedConnection` @experimental | Remote DOM: the UI worker's runtime, and the page's guarded receiver | `sdk-tests/guardedConnection.test.ts` › `records built with Remote DOM's own constants are judged and applied` · `serene-pub/src/lib/client/components/host/componentMount.dom.test.ts` › `core's own module edits unasked, its press relayed off the worker channel` |
| **Component mount points** | `WidgetDecl.component`, via `widget()` @experimental | `widget` only. The `page` mount point is not built (see [Gaps](#5c-gaps)) | *widget*: `serene-pub/src/lib/client/components/host/componentMount.dom.test.ts` › `core's other modules are widgets: their ids are their box's and they paint inside it, as a plugin's (F8)` · `serene-pub/src/lib/client/components/surfaces/panel.dom.test.svelte.ts` › `is posted its granted section by the table's name` |
| **Widgets** | `widget()`, `WidgetDecl` @experimental · `coreWidgets` @public | Core's messages, Stats, World State, scene portraits and Lore entries widgets. A package's own widgets | *all core*: `sdk-tests/widgetSections.test.ts` › `each names a component and resolves to core's remote — no switch, no native` · *messages*: `sdk-tests/coreConversationComponent.test.ts` › `core's conversation component renders, streams and edits` · *World State*: `sdk-tests/coreStateWidgets.test.ts` › `draws the world, one control per slot type, in core vocabulary` · *Stats*: `sdk-tests/coreStateWidgets.test.ts` › `scene: a card per cast member in play, a retired slot greyed and not editable` · *scene portraits*: `sdk-tests/coreScenePortraitsComponent.test.ts` › `core's scene portraits: the cast, its bars, the sprite-set menu only where allowed, the viewer's persona` · *Lore entries*: `sdk-tests/coreLoreEntriesComponent.test.ts` › `core's Lore entries pages the book through 'session-entries' and draws what the page answered` · *package*: `sdk-tests/widgetDecls.test.ts` › `a package widget names a component the package declares, once` |
| **Host elements** (`sp-*` and the plain elements a component may place) | `SP_HOST_ELEMENTS` @experimental | The app's `sp-*` implementations, and the receiver's element policy | `serene-pub/src/lib/client/components/hostElements/registry.test.ts` › `every sp element in SP_HOST_ELEMENTS is implemented, and nothing else is` · `sdk-tests/componentHarness.test.ts` › `an sp element event carries its declared detail; the locale arrives on ctx` |
| **Frame points** | `FramePoint`, `SurfacesDecl` @experimental | `session-view`, `page`, and a document inside a component (`sp-frame`, the `panel` point). All three are also mounted live, sandboxed, by the app's C7 gate spec `frames` (`scripts/c7Gate/specs/frames.ts`), which the census cannot name because it is not a test | *declarations*: `serene-pub/src/lib/server/plugins/frameHost.int.test.ts` › `reads session-view and page tolerantly` · *sp-frame*: `serene-pub/src/lib/client/components/frames/pluginFrame.dom.test.ts` › `what its host passes, and never a widget's data` · *protocol*: `sdk-tests/framePort.test.ts` › `protocol 2, and the surface point — not a hardcoded 1` |
| **Preview-harness targets** | `PreviewTarget`, `previewManifest` @experimental | Frame targets (`session-view`, `page`) and component targets (`widget`), drawn by `ui-preview` and, for authored components, by the in-app component preview | *frame*: `sdk-tests/surfaces.test.ts` › `reads an announce builder without the author compiling first` · *component*: `sdk-tests/surfaces.test.ts` › `components come through with their point and framework` · *in-app preview*: `serene-pub/src/lib/server/sockets/components.int.test.ts` › `mints a capability URL served only to its minter while it lives` |
| **Component test harness** | `mountComponent` @public | `@serene-pub/cli/testing` | `sdk-tests/componentHarness.test.ts` › `a scaffolded Svelte component renders its canned context, and hears a change` |
| **Widget request kinds and their askers** | `WIDGET_REQUEST_ASKERS`, `WIDGET_REQUEST_KINDS` @experimental | 22 request kinds, each asked by `any` widget, by `core` only, or by a widget granted a `{ scope }`. The session page answers each one through its own module under `sessionPage/requests/`, which declines with a sentence | *askers*: `sdk-tests/widgetSections.test.ts` › `every kind says who may ask it — the five R21 kinds among them` · `serene-pub/src/lib/client/components/sessionPage/requests/askers.test.ts` › `a plugin's widget asking a core-only kind is refused, and the page's answer never runs` · *session-entries*: `serene-pub/src/lib/client/components/sessionPage/requests/sessionEntries.test.ts` › `asks for the page's own session, with titleOrKey as the socket's query` · *set-attribute-value*: `serene-pub/src/lib/client/components/sessionPage/requests/setAttributeValue.test.ts` › `writes one owner's value through the store, owning its error` · *set-entry-marks*: `serene-pub/src/lib/client/components/sessionPage/requests/setEntryMarks.test.ts` › `sends only the marks asked for, and resolves with both as they now stand` · *set-sprite-set*: `serene-pub/src/lib/client/components/sessionPage/requests/setSpriteSet.test.ts` › `writes the switch for the page's own session, and back to the card's own with null` · *clear-scene-image*: `serene-pub/src/lib/client/components/sessionPage/requests/clearSceneImage.test.ts` › `clears the page's pin on that side, and the projection the widget reads follows` · *messages*: `serene-pub/src/lib/client/components/sessionPage/requests/messages.test.ts` › `answers with the page's older page, ignoring the request's cursor` · *open-character*: `serene-pub/src/lib/client/components/sessionPage/requests/openCharacter.test.ts` › `opens the panel, then points it at the character` · *view-avatar*: `serene-pub/src/lib/client/components/sessionPage/requests/viewAvatar.test.ts` › `refuses a ref naming no one, in words` · *view-image*: `serene-pub/src/lib/client/components/sessionPage/requests/viewImage.test.ts` › `anyone may ask: the guard passes a plugin's widget on, and the answer holds it to the app's media` · *open-lore*: `serene-pub/src/lib/client/components/sessionPage/requests/openLore.test.ts` › `points the panel at the target, then opens it` · *prompt-details*: `serene-pub/src/lib/client/components/sessionPage/requests/promptDetails.test.ts` › `shows the line's recorded prompt` · *inspect-run*: `serene-pub/src/lib/client/components/sessionPage/requests/inspectRun.test.ts` › `refuses a viewer who is not an admin, in words, before looking anything up` · *pick-turn*: `serene-pub/src/lib/client/components/sessionPage/requests/pickTurn.test.ts` › `opens the turn picker, whatever the params` · *change-sprite*: `serene-pub/src/lib/client/components/sessionPage/requests/changeSprite.test.ts` › `anyone may ask: the guard passes a plugin's widget on; the control rule is the answer's` · *actions-seen*: `serene-pub/src/lib/client/components/sessionPage/requests/actionsSeen.test.ts` › `core only: a plugin's widget is refused in words and no mark is cleared` · *summarize*: `serene-pub/src/lib/client/components/sessionPage/requests/summarize.test.ts` › `core only: a plugin's widget is refused in words before anything is selected` · *send*: `serene-pub/src/lib/client/components/sessionPage/requests/send.test.ts` › `core only: a plugin's widget is refused in words and nothing is drafted` · *draft*: `serene-pub/src/lib/client/components/sessionPage/requests/draft.test.ts` › `core only: a plugin's widget is refused in words and the draft is untouched` · *switch-persona*: `serene-pub/src/lib/client/components/sessionPage/requests/switchPersona.test.ts` › `core only: a plugin's widget is refused in words and no persona changes` · *add-persona*: `serene-pub/src/lib/client/components/sessionPage/requests/addPersona.test.ts` › `core only: a plugin's widget is refused in words and no modal opens` · *fire-turn*: `serene-pub/src/lib/client/components/sessionPage/requests/fireTurn.test.ts` › `core only: a plugin's widget is refused in words and no turn fires` · *decide-proposal*: `serene-pub/src/lib/client/components/sessionPage/requests/decideProposal.test.ts` › `core only: a plugin's widget is refused in words and nothing is decided` · *harness*: `sdk-tests/componentHarness.test.ts` › `the test answers a component's requests as the page would, and every ask is logged` |
| **Scoped sections and grants** | `WIDGET_SCOPED_SECTIONS` @experimental | `session:full`, `session:state`, `persona`, `characters` and `lore`, each posted only to a box granted it | `sdk-tests/widgetSections.test.ts` › `names each scope and the section it is posted as — session:state among them (R72)` · `sdk-tests/componentHarness.test.ts` › `a plugin's box is posted only the scoped sections its grants cover; core's box every one` · `sdk-tests/componentHarness.test.ts` › `a component is told which of its scopes were granted: not granted is said, never left as loading` · `serene-pub/src/lib/client/components/surfaces/panel.dom.test.svelte.ts` › `is posted its granted section by the table's name` |
| **Person-press gate** | `PERSON_GATED_CORE_VERBS`, `PERSON_PRESS_WINDOW_MS` @experimental | One table, read by both the page and the harness | `sdk-tests/componentHarnessPage.test.ts` › `a plugin box's unprompted invoke of a gated verb is refused; a clicked one passes` · `sdk-tests/componentHarnessKeys.test.ts` › `a person's Enter on a keyed input opens the box's invoke gate, as on the page; a raised key alone never does` · `serene-pub/src/lib/client/components/host/componentMount.dom.test.ts` › `a plugin's press is judged by its gate — no person behind it, no edit` |
| **builtAgainst compatibility** | `ComponentBuiltAgainst`, `componentBuiltAgainstFinding` @experimental | `serene-pub build` records it. The host checks it for package components and for authored components | `sdk-tests/componentBuiltAgainst.test.ts` › `serene-pub build records builtAgainst on every component entry` · `sdk-tests/componentBuiltAgainst.test.ts` › `a vocabulary major the host lacks is refused; a newer minor mounts` · `sdk-tests/componentBuiltAgainst.test.ts` › `the harness refuses to mount a component built for a protocol this host does not speak` · *package*: `serene-pub/src/lib/server/components/compat.test.ts` › `today's record and no record mount; another protocol or an unreadable record is refused by name` · *authored*: `serene-pub/src/lib/server/components/compat.test.ts` › `judged off the stored fingerprint; one from before the record mounts` |
| **Clone and drift** | `cloneCoreComponent`, `driftReport` @experimental · `ComponentDecl.basedOn` @experimental | `serene-pub clone`, `serene-pub drift`, and the in-app clone with its core-changed banner | *clone*: `sdk-tests/cliClone.test.ts` › `writes every source file under components/<as>/ with its path kept, and a based-on.json` · *drift*: `sdk-tests/cliClone.test.ts` › `behind: lists the files core changed, added and removed, and flags the ones edited here too` · *in-app clone*: `serene-pub/src/lib/server/sockets/components.int.test.ts` › `a clone is a NEW widget: its own owner, basedOn the core source, core's declaration copied, compiled, off and unreviewed` · *in-app drift*: `serene-pub/src/lib/client/components/componentEditor/componentEditor.test.ts` › `shows only when core's source hash moved since the clone` |
| **Authored components** (written in the app) | 🚧 app-side. They reuse `ComponentDecl` and add no SDK symbol of their own | The Components admin page: the store, the compile service, `/authored-ui/`, the component preview and the component share file | `serene-pub/src/lib/server/components/authoredComponents.int.test.ts` › `create → get → list → update → delete, with the owner's own id` · `serene-pub/src/lib/server/components/compileService.int.test.ts` › `a compile gives the module, its SHA-256 and the toolchain fingerprint — deterministically` · `serene-pub/src/lib/client/components/host/componentMount.dom.test.ts` › `an authored component (C6) is never core's: its own worker, its presses gated, its ids its box's — whatever module it names` · `serene-pub/src/lib/server/components/authoredArtifact.dom.test.ts` › `core's Stats, compiled by the service from its source.json and read back from the cache, mounts as an authored owner and draws what core's draws` |
| **Venues**: where an action appears | `VENUE_KINDS` @experimental | `composer`, `message`, `extra`, `widget` and `form` are drawn. `session-settings`, `pipelines`, `admin` and `review` are declared but not drawn (see [Gaps](#5c-gaps)) | *the closed set*: `sdk-tests/actions.test.ts` › `a venue kind core does not offer is refused, with the list` · *composer*: `serene-pub/src/lib/server/sockets/sessions.actions.int.test.ts` › `quick → primary, else overflow; the floors are always present` · *message, extra*: `sdk-tests/actions.test.ts` › `every core verb lives at the message venue, retry also at extra; the turn control advance at extra alone (B7)` · *widget*: `serene-pub/src/lib/shared/widgets/context.test.ts` › `a contributed action goes to the host's OWN fire, with the subject, the values and the block` · *form*: `sdk-tests/coreConversationComponent.test.ts` › `a live form shows its buttons` |

### 5c. Gaps

These seams do not yet meet R37. None of them is `@public`, so the freeze does not cover
them. Each one needs to be built once, or to stay `@experimental` until it is.

- **Component mount point `page`.** It is promised in prose only (`ComponentDecl`'s doc
  comment, and `PreviewTarget.point`: "a page mount point comes later, R25"). No type or code
  declares it, and nothing mounts a component outside a widget. A package that needs a page
  today uses the `page` frame point instead.
- **Provisional node definitions** (`speak`, `mcp-tool`, `mcp-resource`). They are declared with
  no handler, on purpose (R-2), and are tagged `@experimental`. The tests prove that they are
  refused, not that they run.
- **Lifecycle moment `load`.** The host calls every other moment in `LIFECYCLE_MOMENTS`, but
  nothing in the app calls a `load` callback, so one declared for it never runs.
- **Venues.** `session-settings`, `pipelines`, `admin` and `review` are in `VENUE_KINDS`, but
  the app draws no list for them. An action placed only there appears nowhere.
- **Frame points `session-view` and `page`.** The tests read their declarations, but no test
  mounts either one. Only the `panel` point (a component's `sp-frame`) is mounted under test. The app's live
  gate does mount both: its `frames` spec (`GATE_SPECS=frames`) installs a fixture plugin and
  checks each frame's sandbox, CSP and what it is posted against a running instance. The gate
  is a script, not a test, so this seam stays listed until a test mounts them.
- **Preview harness.** `ui-preview`, the dev harness that draws frame targets and package
  component targets, has no test of its own. `previewManifest` is tested, and so is the in-app
  component preview, but the harness page that draws the targets is not.
