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

`snapshotRegistry(allTypes(), { release })` projects descriptors into `type_registry` rows.
Sync on boot; a version whose hash changed **raises** rather than publishing or ignoring.

**Proves it:** sync idempotence, plus `checkInstall` returning clean for a document
compiled against this release and `E_SHAPE_DRIFT` for one compiled against another. The
second is the one worth having a fixture for — every id resolving while a shape has moved
is the failure a version number alone does not catch.

### Step 3 — Executor and bindings for what already exists (U3, U5)

Bind the core types to the code that already does the work:

| type                             | binds to                                            |
| -------------------------------- | --------------------------------------------------- |
| `core:query/chat-history@1`      | today's history loader                              |
| `core:query/lorebook-triggers@1` | today's World Info scan                             |
| `core:task/assemble@2`           | today's prompt builder, behind the allocation shape |
| `core:oracle/generate-text@1`  | today's connection adapters                         |
| `core:outlet/create-message@1` | today's message insert                              |

Nothing is rewritten in this step. Each binding is a wrapper, and the wrapper is where the
old code keeps living. One addition at the message outlet: blocks with choices/forms are
stamped with the writing spec's identity via `stampBlockActions` — the seam U5d builds the
`blocks` port on.

**Proves it:** **C3** (halt is halt, not err), **C4** (seed recorded, replay identical),
**C6** (budgets meter consumption, waiting is free), **C7** (timeouts bound execution, not
waiting), **C8** (forced-sequential is identical to parallel).

**Status:** `chat-history`, `create-message` and `update-message` are bound and running
against real rows (`src/lib/server/pipelines/`). `assemble` and `generate-text` halt with a
reason, for the structural reason below.

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
the `nodeDefinitions` entry (`{ hook: 'search', reads: { ports: [...], params: [...] } }`).
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
inputs — the caller hydrates the chat and passes it in — so `assemble` can wrap it directly
**provided a Query loads those inputs first**. A Task is handed no services (F11), so the
hydration cannot happen inside `assemble`; it belongs in a Query, and connection **metadata**
reaches it while material never does (F18).

### Step 4 — Parity, before anything flips

The acceptance criterion for replacing the prompt builder is **byte-identical output**,
measured on the **preview payload** rather than on a second renderer written for the
occasion (`08 §5b`). `checkParity` and `parityGate` are in the SDK.

`parityGate` fails an empty corpus on purpose: "nothing was checked" is not "nothing was
wrong", and an integration that reports green over zero fixtures is the single most
expensive mistake available here. Build the corpus from real chats — group chats, chats
with lorebooks, chats at the context limit, chats with custom prompt configs.

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

**Proves it:** **C13** — the previewed payload is byte-identical to the sent one.

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
bare name; `announce.build()` refuses a bare key, and the host normalises one it finds in an
already-installed manifest for one release, logging once.

### Step 9 — Retire the old tables (0.7–0.8)

Retained means frozen (`08 §5a`): the old tables keep working and stop changing. Drop them
only when parity has held across a release and nothing references them. Two clocks, and the
slower one is the user's.

---

## 1b. Tool loops

A **tool** is a named, read-only function a model may ask for by name mid-run.
Canonically it is a plugin's sandboxed hook; core ships four. The three nodes
around it are deliberately small, and two of the three are pure — what makes an
agentic turn expressible is the `loop` block, not a clever node.

### The reference

`core:spec/tool-loop` in `@serene-pub/core-catalog` is the worked example.
Read it; this section is the argument, not the API.

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
2. **A core tool** — `search_entries`, `get_entry`, `grep_transcript`,
   `read_summary`. All read-only, all reading the session through the host's own
   enumerated read, so the hidden-message convention and the character-lore
   privacy gate apply without a tool knowing they exist.
3. **Refused, by name.** Not "no result": a model told "unknown tool" with no
   name asks for the same one again.

Extensions come first deliberately. A plugin shipping `get_entry` has written a
better one for its own world model than core's, and core silently winning would
make it unreachable with nothing to report it.

An error is a **result**, never a throw: `main` is `{ tool, error }` and `text`
renders it, so the model reads what went wrong and tries something else. A throw
would end the run at the one moment the agent could have recovered. **A tool may
not write** — a write inside a repeating block is N writes, which the validator
refuses on the spine (F7) and which a writing tool would smuggle past it.

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
five *types* — whole number with optional bounds, one-of-a-set, text, on/off, and derived — and
nobody adds a sixth. What a genre or a plugin declares is a **definition** composed from those:

```ts
import { defineAttributeSlot, definePluginAttributeSlot, derivations } from '@serene-pub/sdk'

const hp = defineAttributeSlot('acme.crawl:slot/hp@1', {
  type: 'integer',
  label: { en: 'Health' },                       // what a person reads — free to copyedit
  description: { en: 'How much punishment they can take.' },
  descriptor: 'Current health out of the maximum; zero means down.',  // what the MODEL reads
  appliesTo: ['cast'],                           // 'cast' | 'world'
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
  (`derivations.age.id` today) and the slot it reads (`config.from`). There is nothing to store
  and nothing that can go stale.

An inventory is **not** a slot: an item is a lorebook entry and carrying it is a possession
edge, so the item keeps its prose, keywords and retrieval. Declaring an `items: text` slot is
the one modelling mistake this vocabulary exists to prevent.

On the pipeline side, `core:query/session-state@1` publishes the resolved state
(`{ world, cast, possessions }`) and `core:task/set-state@1` changes it. Set state defaults to
`mode: 'propose'`, which holds the change for a person to accept — the review gate a model's
writes always pass through. The three core tools (`set_state`, `give_item`, `take_item`)
likewise only ever propose.

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
(`saveDocument`), so a plugin's genre — which `genre()` never saw — is refused with the same
sentences there.

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

## 2. Seams that will need work — known, not discovered

These are places where the draft is deliberately minimal. Each one is a substitution, not a
redesign, and the tests around them pin the contract rather than the implementation.

| seam                       | what the draft has                      | what core needs                                                                                                                                                      |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Template engine**        | ~200 lines: `{{ a.b }}` and `{% for %}` | a real Jinja2. The registry (`src/engines.ts`) already treats the engine as a datapoint, so this is registering one, not rewriting callers                           |
| **Tokenizer**              | `roughTokens`, chars ÷ 4                | the real tokenizer per connection. `CostProfile.exact: false` already marks estimates so they degrade visibly rather than silently                                   |
| **The packager's scanner** | a dependency-free lexical scan          | a real TypeScript parser. The scan is correct for the shapes it recognises and is explicitly commented as a placeholder — swap `scanSource` and keep `compilePlugin` |
| **Map concurrency**        | forced sequential                       | real per-iteration scoping. The observable result is identical, which is exactly what C8 asserts, so this is a performance change and not a semantic one             |
| **Secrets**                | tagged plaintext                        | encryption against the app secret in `meta.json`. `forOwningHook(decrypt)` is already the seam                                                                       |
| **Sidecars**               | no transport                            | `jsonrpc-stdio@1` (U13)                                                                                                                                              |

A template slot may name **one** language (`engine: handlebars.id`) or the **set** it accepts (`engines: [handlebars.id, liquid.id]`, most-preferred first — the first entry is what a new template in that slot is written in, and the host offers the union of the accepted pools in one picker); both spellings stay valid, so declare `engines` only when your slot genuinely renders more than one.

---

## 3. What "integrated" means, as a checklist

- [ ] `@serene-pub/conformance` runs in CI against core's executor, all 15 green
- [ ] one real chat turn runs as a pipeline end to end, from a real trigger
- [ ] the parity corpus is byte-identical over fixtures drawn from real chats
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
