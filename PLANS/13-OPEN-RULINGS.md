# 13 — Rulings

**Status:** Live. Eight rulings taken 2026-08-18, §7a ratified the same day, a second batch of three
in §10, dev mode in §11, and the configuration surface in §12 (2026-08-19). **Every section is RULED
or CLOSED**, and propagated into 00–17 — except §12's four *findings*, which are raised and open.

Five things in the batch changed a law or a doc that already said otherwise. Those are called out
as **⚠ Contradiction** with the law number, so nothing lands silently.

---

## 1. Joined effects — **RULED: removed**

> *"Whatever node is handling the union should know what shape to expect, i.e. multiple objects,
> each with an iterative id or something."*

Read as option 1: **async blocks absorb the use case, joined effects do not survive.** Awaited work
belongs on the spine inside a block; it is not a child pipeline. That removes the second causation
mechanism, which is what event unification was for.

**The union shape.** An async block's output is an **ordered list, one entry per branch, each
carrying its branch key and its position** — not a merged object. Reasons, in order of how much they
matter:

- A merged object needs a collision policy for same-named fields, and every collision policy is
  wrong for somebody. A list has no collisions.
- The downstream node types against one shape regardless of branch count, so adding a branch is not
  a breaking change to the consumer.
- It is the shape **map** already produces (01 §4), so `async` and `map` hand downstream the same
  thing and F26's forced-sequential equivalence test covers both with one harness.

```
core:shape/branch-results@1
  [ { branchKey, index, result } ]      // result is the discriminated ok|err|cancelled|halt
```

Branch order is **declaration order, not completion order** — same rule 11 §3 already applies to
event dispatch, so there is one ordering rule in the system rather than two.

**⚠ Consequence you should see before this closes.** Joined effects were the only route to *reuse of
awaited work across specs*. Removing them leaves reuse with no runtime path at all — which is fine
**only because §7f's compile-time include lands in 0.6**. Ruled together, below. If the include
slipped, this ruling would leave a real hole.

Closes the open paragraph at 11 §3. F25, F26 unchanged.

## 2. Receipt retention — **RULED: diagnostic only, count-capped**

> *"No receipts for user data import, it's purely diagnostic logging. Can have a default like retain
> last 1000 pipelines or something, set in system settings."*

Accepted. Receipts are **excluded from user data export** (12 §7); a user exports persona cards,
chats and prompt configs, and the chat already carries the content. Retention is an admin setting
with a shipped default.

Three additions, because the ruling as stated leaves gaps that would bite:

**(a) Count alone is not a bound — add a byte ceiling.** A run that halts on the first node and a run
that assembled a 200k-token context differ by four orders of magnitude. "Last 1000 runs" is a
sensible *shape* for the setting and an unbounded promise about disk. Ship **last N runs or M
megabytes, whichever trips first**, defaults `N = 1000`, `M = 512 MB`.

**(b) The compact receipt is what actually solves the multiplier.** This section was flagged urgent
because a hot event × every subscribed pipeline × every message writes a full receipt per message,
and **most of those runs halt immediately** — "this chat type isn't applicable" is the common case
and it is success (01 §5). A run that halts **before any effectful node** writes a compact receipt:
trigger, spec version, halt node, halt reason, elapsed. No payloads. That is the row that would
otherwise dominate the table by count.

**(c) ⚠ Contradiction to settle: "diagnostic" does not survive user removal.** Receipts record
Provider I/O verbatim (F16), which is the user's messages and the model's replies. "Not user data
for export" and "safe to keep after the user is gone" are different claims, and only the first
follows from *diagnostic*. **Recommendation: deleting a user deletes their receipts.** It is the only
answer that doesn't make "remove user" untrue, and it costs one cascade.

Unblocks U6, U9, U22.

## 3. Run caps and the parked-gate ceiling — **RULED**

> *"Run gating can exist with a reasonable default and be queued. Admins can see the global queue and
> kill pipeline runs or go disable the user all-together. Global budget with reasonable default, and
> per user opt in budgeting managed by admins."*

Accepted whole. Three details that fall out of laws already on the books, recorded so the
implementation doesn't invent alternatives:

- **Queue wait is free.** Time spent queued consumes no budget (F13 — budgets meter consumption) and
  trips no timeout (F36 — timeouts bound execution, waiting stays free). A run's clock starts when it
  is dequeued. This is the same rule that already makes a week-long parked review gate legal.
- **An admin kill yields `cancelled`, not `err`.** The discriminated result set already has it
  (01 §5); the receipt records the actor. No new result kind, and "an admin stopped it" stays
  distinguishable from "it broke" — which is the whole point of having four result kinds.
- **Parked gates are counted, not timed out.** The ceiling is a count of simultaneously parked gates,
  global and per-user. Exceeding it queues the *run* rather than rejecting the gate, so nothing a
  reviewer sees ever disappears from under them.

Unblocks U3, U9.

## 4. Chat ownership in group chats — **CLOSED: already exists**

SP chats already carry an owner. Participants get user scope only; the owner gets chat scope
(12 §2). Nothing to build. Unblocks U16.

## 5. Encryption key management — **CLOSED**

> *"I believe encryption is already handled, app secret for encrypt lives in meta.json in the appdata
> dir."*

Recorded in 02. Two residuals kept because they are cheap now and awful later:

- **A restored backup with a mismatched key must fail loudly and locally.** Connections whose
  material won't decrypt are marked **needs re-entry** and their Providers fail with a named error,
  rather than the app failing to start or a run failing with a generic 401 from the vendor.
- **The golden harness asserts no receipt in the corpus contains a credential.** Provider I/O is
  recorded verbatim (F16) and receipts are handed to plugin authors for debugging, so this is the
  test that keeps F18's material/metadata split honest under change.

Unblocks U5, U6.

## 6. Secret-typed plugin settings — **RULED, with a correction**

> *"Do which ever is best. We can recommend extensions own their own sqlite db... Or we can add a
> free-form secrets column in the extensions data table... that SP encrypts and decrypts on demand."*

**⚠ Contradiction with a ruling already written into 03 §8** ("No plugin secrets column. SP declines
to be the custodian of plugin secrets") and with the earlier instruction to remove the secrets
column. Flagging it rather than quietly reversing it — but the ground genuinely moved, because §5
established that SP already holds an app secret and already encrypts connection material. Custody is
no longer hypothetical.

**Ruling: a typed `secret` settings field. Not a free-form column, and not option A.**

**Option A is not the safe choice it looks like.** An extension owning its own SQLite file has no key
of its own and no crypto facility, so the realistic outcome is **plaintext credentials on disk in the
extension data directory**. SP isn't the custodian of record, but the user's key is still sitting
unencrypted on the user's machine, and now nothing can even audit it. Declining custody produced a
worse outcome than accepting it — which is the whole reason to revisit the earlier ruling.

**Free-form loses the three properties that make custody defensible.** If the column is opaque JSON,
core cannot tell a secret from a note, so it cannot mechanically enforce any of:

| | Enforceable if typed | Enforceable if free-form |
|---|---|---|
| Redacted from receipts (F16 recorder) | ✅ by type | ❌ core can't identify it |
| Excluded from export (12 §7) | ✅ | ❌ |
| Write-only in the UI, never returned to the client | ✅ | ❌ |

So: a `secret` field type in the settings schema, encrypted at rest with the app secret, write-only
in the UI, **delivered only into the declaring extension's own hook invocation context**, never
readable through the SDK data API, never recorded, never exported.

**This narrows the earlier ruling rather than reversing it.** The principle was *SP declines custody
of capability core doesn't control*, and it still holds for connection material (F18) — an extension
adapter never sees core connection data, and core never sees a plugin's. What changes is that a
**declared, typed, encrypted, write-only field the plugin owns end to end** is not custody of
somebody else's capability; it is storage with the same protections F18 already demands.

03 §8's heading changes from *"No plugin secrets column"* to *"No free-form secrets column."*
Unblocks U10, U16.

## 7. Budget owner for UI-initiated runs — **RULED: start the run from an event**

> *"Sure, but we should probably delegate the pipeline start via an event. Event supplies the chat id,
> owner user id, triggering user id, what happened, what type of chat it is, etc."*

Better than the recommendation it replaces, and it **answers the budget-owner question directly**
rather than requiring a separate rule: the event carries both users, so **budget and quota attach to
the owner; the receipt's attribution records the trigger.** Group chats need no special case.

**⚠ One structural consequence worth naming, or the closed set blurs.** F8 describes events as
occurrences core observes — *something changed*. A UI action is core-observed but it is a **command**,
not a data change. Rather than let the two blur, the registry gets **two families, both core-owned,
both on the same consent screen**:

| Family | Example | Cycle-checkable? |
|---|---|---|
| **Data events** | `core:event/message-created@1` | yes — they have write-target mappings |
| **Action events** | `core:event/ui-action@1` | trivially — no write targets, so they cannot participate in a write→event cycle |

That distinction is load-bearing for the recursive CTE in 11 §3: action events have no
consumer-target mapping, so they drop out of the cycle graph instead of needing an exception. F8 is
unchanged — core still emits, from a closed set.

Re-roll becomes "emit the action event with the original input," which is the existing regenerate
contract. Unblocks U18, U26.

### 7a. Review gate keyed on effects — **RULED: ratified 2026-08-18**

The gate fires for **any node declaring external effects, whatever its kind**, rather than for
Consumers only — otherwise an effectful MCP tool, which is a Provider, is ungateable.

Written into 01 §7 and F14, and **implemented and passing in `sdk-draft`** (use cases 25–30a).
It is a better law than the original: the gate becomes about effects, which is what it was always
for, rather than about kind, which was a proxy. Unblocks U8, U19c.

**⚠ Amends a Fixed Ledger entry (F14).** Recorded here because a ledger change that cannot be
traced back to the moment it was made is a ledger nobody trusts. What moved: the gate's trigger,
from *kind* to *declared effects*. What did not move: the three positions, the author's ability to
default it on, the impossibility of forbidding it, its undetectability from plugin code, and its
appearance in the receipt.

**The alternative and why it lost.** Keying on kind is the tidier rule and leaves the ledger
untouched, but it has a hole with a name: an MCP tool that sends mail is a *Provider*. Under the
kind rule nothing can gate it, so the tools with the most real-world consequence are exactly the
ones with no review path — and closing that later means a second review mechanism, which means two
places a user looks for the same switch.

**What ratifying does not do:** it does not add a single prompt for anyone. The position still
resolves to `off` unless an author defaults it on or an admin sets it. This ruling decides only
whether the switch *exists*, not whether it is thrown. The one place a default *is* written is
14 §4's freshly-snapshotted MCP tool, which gets `review: 'sync'` at instance scope until an admin
classifies it — an unclassified tool that acts on the world should wait for a human the first time.

### 7b. "task" vs "Task" — **CLOSED: `task` is retired**

> *"Pipeline is a pipeline, a task node is a task node. A pipeline may be active, enabled, triggered,
> inactive (not selected or connected to any events, etc), etc."*

The collision disappears rather than being tolerated. **Lowercase `task` is removed from the
vocabulary** (01 §1) and from the default view (05 §0a). The user-facing noun is **pipeline**, with
declared states:

| State | Meaning |
|---|---|
| **enabled** | installed and permitted to run |
| **active** | selected for this chat, or subscribed to an enabled event |
| **triggered** | currently running, or queued (§3) |
| **inactive** | neither selected nor subscribed to anything enabled |

**Task** is now unambiguously the node kind. No rename to Routine/Job/Behavior is needed.

### 7c. Hook residuals — **RULED**

> *"Lifecycle hooks can't trigger pipelines, but they can make limited scoped SDK calls, i.e. query
> some SP core data, arbitrarily query and write ext. data rows belonging to the ext.s namespace."*

Accepted, and the injected surface is exactly that list: scoped core reads, plus read/write on the
extension's own namespaced rows.

**⚠ Contradiction: as stated, scheduled model work has no path left.** F32 already bars **event
hooks** from calling Providers. Applying the same bar to **lifecycle hooks** — which their injected
surface above implies, since it contains no Provider access — while *also* barring them from
triggering pipelines removes the last route for the legitimate case this residual was opened for:
nightly summarization.

**Ruling: keep both bars, and give scheduled work the same path everything else has — an event.**
Core emits `core:event/schedule-tick@1`; a pipeline subscribes with a declared cadence. Consequences,
all of which are improvements over letting lifecycle hooks call Providers:

- The work gets a **receipt, a budget and the review gate**, which is exactly what F32 exists to
  guarantee and what a lifecycle hook calling a Provider would have quietly opted out of.
- It appears on the **consent screen** as a subscription, so a user can see and disable scheduled
  work touching their account (11 §4) — a lifecycle hook doing the same work is invisible there.
- Lifecycle hooks keep their actual job: setup, teardown, migration, health.

Two smaller residuals:

- **May an event hook subscribe to another plugin's event?** Moot for 0.6 — plugins cannot define
  events (§7g). Re-ask when that reopens.
- **Are private pipeline hooks enumerable in the manifest?** **Yes, list them.** Permissions are
  already compiled from SDK usage, so the manifest is the audit surface; listing costs nothing and
  hiding them buys only marginally less noise.

### 7d. Bundling — **CLOSED: curation carries it**

> *"Bundling all the dependencies is a recommendation... If an ext has a bunch of external steps to
> perform, they will blame the ext, not SP... SP does ship with a portable node runtime though."*

The technical layer stays permissive and verified (F33): bundle, or declare a host requirement SP
checks at install, or fetch a dependency declared with a checksum. Listing in the official repository
is a **policy** filter, not a mechanism — a user who wants a high-setup plugin adds its repo as a
custom source.

**The portable node runtime settles §7h too** — see there.

### 7e. Release provenance — **RULED: reserve the fields in 0.6**

Under "build it all in 0.6" (§8). Verification can land in 0.7; the manifest fields are reserved now,
because retrofitting provenance onto a repository model with releases already in the wild makes every
existing plugin unverifiable until re-released.

### 7f. Fragments / compile-time include — **RULED: ships in 0.6**

Required by §1, which removed the only other route to reuse. A named, versioned chain expanded at
publish; rows hold the expanded nodes; keys namespaced by the include (`ctx.embed`, `ctx.search`);
receipts stay per-node; the executor learns nothing. Compile-time only.

Unblocks U12 and the context-infill migration in U25 — and it is the mechanism the two-engine
redesign in **18-CONTEXT-ENGINES** is built on.

### 7g. Plugin-defined events — **CONFIRMED deferred, with the table shaped for it**

> *"SDK 1.0 won't support extension events... only SP Core ships with predefined events. But shape the
> events registry in a way that custom events can be registered later. Events table will include slugs
> so while ID is the primary key, slugs are unique and provide a way to sync/update events in the
> database by a fixed, PK agnostic reference."*

F8 stands. The registry is shaped for later:

- **`slug` unique, PK-agnostic.** ID stays the primary key; the slug is the stable reference used to
  seed, sync and update rows across instances and upgrades.
- **`owner_plugin_id` reserved, null for core**, so reopening is a column that already exists plus a
  permission.

**Recommendation, near-free: apply the slug convention to every core-seeded registry** — node types,
surfaces, shapes, events — not to events alone. They all have the identical problem of keeping a
seeded row identifiable across instances where the autoincrement ID differs, and one convention
beats four.

### 7h. In-process timeouts — **CLOSED: abandon, don't kill; say so**

`runtime: process` kills; `runtime: node` abandons and the abandoned code keeps running (F36).
Mitigation stays cooperative — abort signal to every hook, repeated abandonment marks the plugin
unhealthy and disables it.

**Worker threads are rejected.** Because SP ships a portable node runtime (§7d), `runtime: process`
is always available at low cost, which makes the honest advice usable rather than theoretical: **if
your work can hang, `process` is the transport that can actually stop it.** Worker threads would buy
real termination at the cost of serialization on every call — which is most of what `runtime: node`
exists to avoid.

### 7i. World Info parity — verified, one schema gap

All seven features map with no new mechanism, tested in `sdk-draft` use cases 35–41.

| Feature | Mapped as |
|---|---|
| regex keys, logic operators, scan depth | `params` on the trigger Query |
| recursion | bounded scan inside the Query's interior — no pipeline construct |
| constants | `priority: 'always'`, honoured before the budget |
| probability | rolled against the run seed — **replayable, which ST's is not** |
| inclusion groups + weight | the rank Task, doing its existing job |
| insertion order | a sort key, or template ordering |
| positional insertion at chat depth | the **assembly template** (16 §5e) |

**⚠ The one real gap is the lorebook model: SP entries have no `depth` field.** An entry-schema
addition, not architecture. Blocks U25.

### 7j. Findings from the draft SDK — **RULED**

**(a) Template scope cannot come from typed ports alone.** Ports carry the scope of an *assembly*
template but not a *source* template, whose variables live inside the port's payload. **The template
slot declares its own `variables`.** One descriptor field; 16 §4 corrected.

**(b) Under async review, downstream receives a proposal id. Ruling: a discriminated
pending/committed shape**, not a shared id space. Under a shared id space a downstream node writes a
foreign key to a row that a reviewer may still reject — the reference is indistinguishable from a
real one right up until it dangles. A discriminated shape makes the validator force downstream to
handle both, at publish, with a named error.

**(c) "Effectful by default" ≠ "reviewed by default."** An MCP snapshot writes `review: 'sync'` at
instance scope until an admin classifies the tool read-only, so a freshly-snapshotted tool that sends
mail cannot run unreviewed.

## 8. Smaller items — **RULED: build them all in 0.6**

| Item | Ruling |
|---|---|
| L1 folds into L2 | Ships in 0.6; the collapse is permission-enforced for non-admins (05 §7) |
| Facet naming | Close before L2 UI copy; cosmetic |
| Accept-all re-confirmation | Re-confirm on a **new kind** of permission, not a new instance (11 §4) |
| Provenance fields (§7e) | Reserved in 0.6 |
| Fragments (§7f) | Ships in 0.6 |
| **Embeddings connection switch** | **Re-embed in the background, resumable**, using `embedding_model_ref` (16 §2a). Refusing while vectors exist makes the setting a trap; orphaning returns wrong neighbours silently. Re-embedding is the only option that is both reversible and diagnosable |
| **Session fallback visibility** | **Announced, once, in the session.** A silent fallback to the core default is a behaviour change the user will otherwise attribute to the model |
| **Live sessions on a retired spec** | **Run out the chat.** Published rows are frozen (02 §3), so the running version still exists; blocking retirement punishes the admin for someone else's open tab, and migrating mid-chat changes behaviour under a user with no signal |
| ⚠ **Retrieval `strategy` enum** | **Held at `auto`/`vector`/`keyword` for 0.6.** The one place "build it all" collides with a scoping ruling already taken (16 §2) — `hybrid` and NER-assisted stay post-0.6. Both are additive enum values, so deferring costs nothing later |

## 9. Reference: the example plugin

**Components:** three chat-message renderers — Svelte, React, vanilla — against the same ABI.

**Extension:** a dice-roll chat mechanic. Roll dice, ask the model to do something with the result,
commit a message. Custom Task and Consumer; a roll button in the composer, a re-roll in the message
menu.

**What it exercises:** custom Task and Consumer · a full spec end to end · a Provider call on a shared
shape · `match` binding backend output to a custom renderer · emit-plus-write with row ids flowing
downstream · four surface points · three framework adapters · namespaced extension data · component
settings.

**What it forces:** `composer-action@1` in 0.6 · the UI-initiated-run ruling (§7), now an action
event · **the run seed**, because a dice roll is nondeterministic but not external.

**Near-free additions:** default the dice Consumer's review gate to **on** — best case for the gate
(*"you rolled a 1. Accept, edit, or reject?"*) and it proves an author may default review on but never
forbid it; and roll multiple dice through a **map**, exercising F26's equivalence property.

**Not covered:** sidecar transport · scheduled hooks · cross-plugin dependencies · migrations.


---

## 10. Rulings taken 2026-08-18 (second batch) — **all RULED**

These came out of building the SDK. All three are now decided, implemented and pinned by tests
(use cases 104–108).

### 10a. Connection bindings — **RULED: no table, and the guarantee comes from somewhere better**

A preset may not set `connection` (12 §3a, F20), so an exported pipeline carries none and the
importer wires it by hand. The question was whether the binding deserves its own table, so that an
export could state *structurally* that connections were excluded.

**Ruled: no table.** A second table implies a second lifecycle — its own ids, ownership rules and
migration — and there isn't one. A connection binding is a config value at instance scope, which
12's five-layer chain already owns.

**The interesting part is that the table would have answered a weaker question.** It could only
report the connections the exporting instance had *filled in* — so a pipeline exported before
anyone configured it would claim to need nothing, and the importer would discover the truth at the
first run. Slots are declared on the **type**, so the requirement is derived from descriptors
instead: complete by construction, independent of what the exporter did or whether the exporter was
configured at all.

`ExportResult.requires` now carries every connection an import must wire, each with the connection
**kind** — so an import screen offers only compatible connections (F17) rather than the whole list.
`unwiredConnections` feeds `needs-configuration` (12 §6), which stays distinct from `broken`: a
spec nobody has configured is unfinished, not damaged, and the difference decides whether a user
files a bug or opens settings. Use case 107.

### 10b. `commitMessage` — **RULED: split into `createMessage` and `updateMessage`**

The old type decided new-vs-update from whether an id happened to be present. That is the implicit
branch F25 exists to prevent: two specs that did different things looked identical, and the receipt
could not say which had happened. Two ids, two names, no inference — and now two `causesEvent`
declarations, so the receipt distinguishes them without being asked to.

**`updateMessage.target` takes `row-ids@1`, which makes create → update *within one run*
unwritable.** That is the ruling, not an oversight: under async review the created row is a
proposal a reviewer may reject, so the pair is a dangling write waiting to happen. The case people
reach for it with — write a placeholder, fill it as tokens arrive — is streaming, and streaming is
one node with a settled output (01 §11), not two nodes and a hope. The case it *is* for is the one
where the id comes from outside the run: the user clicked a message, so the id is on the Input.
`core:input/message-created@1` now types `messageId` as `row-ids@1` rather than `json`, which is
what makes that wireable.

**⚠ Contradiction found while implementing.** Three core Consumers declared `effects: 'write'`
while publishing `row-ids@1` — `attach-image`, `attach-audio` and `save-plugin-data` — each one a
spec that could wire a foreign key to a row no reviewer had approved. 13 §7j-b said writes publish
`write-result@1`; three types said otherwise. **The rule is now checked at type registration**
rather than reviewed by hand, with the failure named in the error. Use case 105.

`splitCommitMessage(doc)` migrates legacy specs: an id wired in means update, nothing wired means
create, and **anything else is reported `unmapped` rather than decided** — including the create →
update pair, which needs a person. A migration that guesses here converts a spec that used to
update into one that creates, and the user finds out when their chat fills with duplicates. Use
cases 104, 106.

### 10c. Type registry and schema sources — **RULED: three moments, three sources**

The question underneath "schema sources" was which artefact is authoritative. The honest answer is
that a different one is authoritative at each moment, and writing that down *is* the ruling —
pretending there is a single source is what would go wrong.

| moment | source of truth | why |
|---|---|---|
| authoring | the `Descriptor` in code | the author is *defining* the type; nothing else knows it yet |
| compiling a spec | generated `/contracts` | frozen per release, so a pin resolves the same way forever (04 §2) |
| installing | **the `type_registry` row** | the only one core can read without executing the plugin |

The third row is the point. F6 means core imports documents and never authoring JS, so
installability must be decidable from data alone: the manifest, and the documents beside it.
`checkInstall` does that, and `snapshotRegistry` projects descriptors into rows so core seeds the
table from its own contracts.

**The failure worth building this for is not a missing type.** That one is obvious and fails
loudly. It is a plugin **built against a different release**, where every id still resolves but a
port now produces a different shape — nothing looks wrong until the value reaches a node that
cannot read it. Documents record the shape each edge was compiled against, so `E_SHAPE_DRIFT`
catches it at install. Also checked: redeclaring a type the plugin does not own, pinning someone
else's private type, declaring a type with no binding, and — as a *warning*, because a pin that
still resolves still runs — a newer version being available. Use case 108.


---

## 11. Dev mode: point at an entry file, load in memory, hot reload — **RULED**

> *"I'll want to allow devs to temporarily import plugins by pointing to an entry point js/ts
> file that the SDK declarations are made. pipelines, hooks and components imported memory only
> and hot reload."*

**⚠ Contradiction with F6 — resolved, not excepted.** F6 says core imports documents and never
authoring JS; 04 §5a says nothing is discovered by executing. A loader that evaluates
`src/index.ts` and pulls pipelines, hooks and components out of memory looks exactly like the
thing both forbid, and the resolution has to be stated precisely or it becomes the hole everything
else leaks through.

**What F6 protects is the importer.** Its claim is that no code path reachable from installing or
running a plugin evaluates authoring JavaScript — so a document cannot become a program, and a
plugin cannot announce capabilities its manifest never declared. That claim survives, because the
dev loader does not hand core an `Extension`. It **compiles** — same packager, same manifest, same
documents — and hands core the same plain data an installed plugin does. The evaluation happens in
the dev harness, on the developer's machine, on their own code, exactly as it does inside
`serene-pub build`.

So the rule that actually holds is narrower and truer than "core never evaluates JS":

> **Every path into core carries a manifest and documents. Dev mode changes where they were
> produced, not what core receives.**

### The four invariants

Stated as data in the SDK (`DEV_INVARIANTS`) so the host can assert them rather than remember
them — the first one is the kind that stops being true quietly.

| | rule | what breaks without it |
|---|---|---|
| **D1** | a dev overlay writes no rows | a dev plugin whose rows outlive the session leaves chats pinning types with no install to uninstall |
| **D2** | permissions are compiled and double-checked identically | dev mode becomes a way to hold permissions the manifest never declared (F28) |
| **D3** | every receipt records `source: 'dev'` | *"it worked on my machine"* stops being distinguishable from *"it worked"* |
| **D4** | no in-flight run changes underneath itself | a receipt claims to describe a run of a specific spec version, and that claim becomes false |

D2 deserves one more line: **dev mode changes the source of the code, never the trust in it.** The
runtime permission check does not know or care that a plugin came from a file path.

### Hot reload: what is hot, and what waits

D4 decides it, and the answers are not uniform:

| change | hot? | why |
|---|---|---|
| a **handler** body | **yes** | swapped between runs — this is the loop the developer is in, and the whole point |
| a **component** | **yes** | components render; they do not participate in a run |
| a **new** type or pipeline | **yes** | nothing can be using it yet |
| a **type's ports** | no | the run's edges were validated against the old shape; the executor would be moving a value into a port that no longer accepts it |
| a **pipeline document** | no | a receipt names the spec version it ran |
| a **removed** type | no | a run may be mid-node |

A cold change is only *actually* blocked when something is using the thing it touches, so the
common case — edit a pipeline with nothing running — applies instantly. When it is blocked,
`reloadPlan` returns **which runs are holding it up**, and the host shows *"waiting on 1 run"*
rather than a reload that appears to have done nothing. Silence is what makes a developer restart
the app and lose the state they were debugging.

### What is left to core

Loading, watching and cache-busting are the host's job — it owns the module cache, the watcher and
the process. The SDK deliberately takes an already-evaluated `Extension`, which keeps it from
quietly becoming a module loader and keeps the diffing pure and testable. Use case 109.

**Gating:** dev loading rides the existing dev flag (07 §0a) and is admin-only. It is a
development affordance, not a second install path, and an instance where anyone can point core at
a file is an instance with no install boundary at all.

---

## 12. The configuration surface — **RULED 2026-08-19, five rulings and four findings**

Taken while building the pipeline view (05 §0a) and the management page. Each one came out of
something that did not work, rather than out of reading.

### 12a. A registry row carries slot **declarations**, not slot **names**

> ⚠ **Contradiction with the shipped code, not with a law.** `snapshotRegistry` projected
> `slots: Object.keys(d.slots)`, and `pipeline_type_registry.slots` stored `{"params": true}`.

12 §2 says slot declarations live in the type descriptor *"so a plugin Provider's prompt fields
render next to core's automatically, with no UI work"*, and 13 §10c says the registry row is the
artefact core reads **without executing the plugin** (F6). A list of names satisfies neither: a form
generator handed `['prompts', 'params']` knows a form exists and nothing about what goes in it, so
it must fall back to the in-process descriptor map — which exists for core types, does not exist for
a `transport: 'process'` plugin type, and is precisely the thing F6 forbids reaching for.

**The row now stores the whole `SlotDecl`.** The pipeline view and the lens view are generated from
rows, and a plugin's sliders appear beside core's with nothing authored twice.

### 12b. Slot declarations are part of a type's content hash; their `i18n` is not

The consequence of 12a. Once the row carries declarations, the question is whether changing one is a
change to the type's contract.

**It is.** A spec that does not override `topK` gets the declared default, so moving that default
changes what an untouched spec does — the silent behaviour change pinning exists to prevent. Ranges
and enums are the same argument one step out: they decide which stored values are still legal.

`i18n` is excluded, recursively, for the reason it is already excluded at the type level: translating
*"Top K"* into German is not a version bump.

**Transition:** the hash of every existing row changed, and `syncTypeRegistry` refuses rather than
reconciling — correctly, since it cannot tell a rewritten pin from a bug. Migration 0099 empties
`pipeline_type_registry`, which is a re-projection rather than a data loss: the table is a projection
of the running build, seeded at boot, referenced only by text pins. **This is a one-time correction of
the projection's own shape and must not become a pattern** — clearing it on an upgrade that had *not*
changed the projection destroys the guard 02 §3 depends on.

### 12c. Instance overrides and preset values stay in **two** tables

> ⚠ **Contradiction with 12 §3.** *"A preset's values are flat `(node_key, slot, value)` rows —
> exactly what `node_overrides` already stores — so installing a spec seeds `config_presets` plus
> override rows at `scope_kind='preset'`."* One table, discriminated.

**The reason is export.** A preset is execution-affecting and round-trips with the document (F4); a
user's overrides are their configuration and, at chat scope, arguably their content. One table means
every export is a `WHERE scope_kind <> …` away from shipping somebody's tuning — or, on the day
someone forgets the predicate, their chat-scoped prompt edits — to whoever they sent a pipeline to.

Two tables make *"does this travel with the document"* a **structural fact rather than a clause
somebody has to remember**. `pipeline_node_overrides` holds `instance | user | chat`; a row claiming
`preset` or `author` is refused by a check constraint, because it would be a second, disagreeing copy
of a layer that already exists. Resolution reads both and projects preset rows in at
`scopeKind: 'preset'`, so downstream the five-layer chain is still one ordered walk.

### 12d. A selection stores a preset **slug**; overrides hang off the **spec**, not the version

Both follow from identities that survive a publish. 12 §3b already rules that the slug is the
identity and the label is the display; this states the storage consequence. A selection pointing at a
preset row id would dangle the moment the pipeline published 1.1.0, and every user who had chosen
*"Lore-heavy"* would silently land back on the default — **on an upgrade, which is when they are
least able to tell what changed.**

Overrides key on `spec_id` for the same reason. F21 makes node keys explicit and stable precisely so
a user's tuning survives the pipeline being edited above it; hanging overrides off a version would
throw all of it away on every publish, which is the failure F21 exists to prevent.

### 12e. The pipeline view's option handles are **not reversible**

05 §0a: *"No topology. No node keys, no step counts, no structure inferable from the DOM."* An option
still has to be addressable, and the obvious encoding — base64 of `nodeKey|slot|path` — is an address
in a costume. Core's node keys are short, ordinary words (`prompt`, `generate`, `rank`), so even a
plain digest falls to a dictionary in seconds.

**An option id is an HMAC of its address under the instance secret**, truncated. Stable across
requests and restarts, so a form can be rendered, left open and submitted; opaque to a browser;
different on every instance. The server resolves one by rebuilding the map from the spec it is
already loading, so there is no table and nothing to keep in step — and a handle for a slot a new
version removed stops resolving instead of writing a row that matches nothing.

**This is what makes §0's system setting real rather than cosmetic.** Structural editing is opt-in;
a default-view payload carrying node keys would hand out the topology the setting is hiding.

*Pinned by a test that walks the serialized payload and fails on any node key outside human prose —
including in property names, which is where the next leak will be.*

### 12f. The pipeline view is for **everyone**; the management page is admin-only

05 §0 says the pipeline view is *"what everyone gets out of the box"*, and it is the surface where a
normal user edits their own prompts. Its nav entry therefore sits outside the admin gate that hides
Sampling, Connections, Contexts and Prompt Configs. Access is enforced per slot and per scope by the
write matrix (12 §4), so each person sees exactly what they may write, rather than the panel being
all-or-nothing on a role.

The management page is the structural view, so it *may* name topology — node counts, versions,
canonical hashes. The two are **different handlers rather than one handler with a flag**, which is
what keeps the boundary from being one forgotten `if`.

---

### Findings raised, not yet ruled

**(i) Core's respond spec declares the same authored prompt text on three nodes.** `buildTemplateContext`,
`assemble` and `generateText` each declare a `prompts` slot, and `world.ts` papers over it by writing
the same value to two of them. Generated honestly, the pipeline view therefore shows a user three
"System" boxes where they have one system prompt. The view is telling the truth; **the spec is the
thing that is wrong.** The fix is a slot reference (`resolvedRefs`, already supported by the
executor) so one node owns the text and the others read it — which changes the canonical hash, needs
a new published version, and needs the parity corpus re-run. Deferred rather than done quietly.

**(ii) 12 §4 says `template` is "opt-in per instance" at user and chat scope. There is no opt-in.**
The SDK's `WRITE_MATRIX` hardcodes `['preset', 'instance']`, so the opt-in has no mechanism and a
user can never edit a template. Safe-by-default and therefore not urgent, but the doc currently
describes a switch that does not exist.

**(iii) `resolveConfig` truncated any path containing a space.** It grouped rows by joining slot and
path with a space and splitting them back, so a declared field named `opening line` resolved against
the path `opening` and matched nothing — silently, for whoever declared it. No core path has a space;
nothing stops a plugin's from having one. Fixed, and pinned.

**(iv) An option's label collides across nodes.** Two Query nodes may each declare `topK`, and *"Top
K"* twice with no way to tell them apart is worse than a longer label. The view disambiguates with
the node's **type** display name — *"Weight (Chat history)"*, *"Budget (Assemble)"* — which is a name
rather than a key and so stays inside 12e. Adequate, not elegant; a type that wants better should say
so in its `i18n`.
