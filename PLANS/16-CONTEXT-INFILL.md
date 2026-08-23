# 16 — Context Infill

**Status:** New 2026-08-17. How retrieval and context assembly are modelled. Depends on 01 §2
(kinds), §3 (typed ports), 12 (configuration), and raises one new primitive (§3).

Context infill is where the Provider kind becomes load-bearing, where the Query/Provider line gets
tested, and where "why did the bot forget my character's sister" is either answerable or isn't.

---

## 1. The Provider / Query line

The rule is one sentence: **crossing the process or network boundary is a Provider; reading SP's
own data is a Query.** No exceptions, because the exceptions are what break replay.

| Operation | Kind | Why |
|---|---|---|
| Embed a query string | **Provider** | external call, nondeterministic, must be recorded verbatim |
| Similarity search over stored vectors | **Query** | reads SP's own data, no boundary crossed |
| Keyword / trigger matching over lorebook entries | **Query** | a DB read |
| NER or any model-based extraction | **Provider** | external call |
| Filtering, ranking, thresholding, dedup | **Task** | pure |
| Assemble into a template | **Task** | pure; Assemble is the flagship Task |

**So "vector retrieval" is two nodes, not one:** embed the text (Provider), then search (Query).
That looks like extra ceremony until you want to answer a support question — and then it is the
difference between "retrieval returned nothing" and "the embedding call failed", which are
different problems with different fixes. It is also what lets the weights lens show the embedding
call and the retrieval separately, and what puts the embedding request in the receipt verbatim
(F16).

**A Query may never reach the network**, including to an embedding service. That rule is what keeps
`replay(receipt)` honest: everything nondeterministic is recorded, so replay never re-infers.

### 1a. Embedding vectors go into receipts by reference, not inline

F16 records Provider requests and responses verbatim. A 1,536-dimension float array per call, over
a long chat, will bloat receipts badly — and the vector carries no diagnostic value a human can
read.

**Record the input text, the model reference, and a hash of the output.** Store the vector itself
in the vector store, where it already lives. Same shape as the credential-redaction rule (13 §5):
verbatim means *the meaningful record*, not every byte.

Ties directly to 13 §2's receipt-size question, which this makes more urgent, not less.

---

## 2. Where the RAG-vs-keyword switch lives

Today the switch is silent when embeddings are enabled, and the instinct to keep it that way is
right — a user who never wants to think about retrieval strategy should never have to. The worry
is that silence corners the future. It doesn't have to, if the decision is *data* rather than
*logic*.

> **Refined 2026-08-17 by writing it out (17 §3a): the `strategy` field belongs on the *merge*
> Task, not on a retrieval node.** All sources always run; nodes with nothing to do return empty
> results, which is an ordinary `ok`. `embed` short-circuits to `ok({vector: null})` when no
> embeddings connection is active, so nothing is wasted and nothing is skipped. The strategy is
> then a pure *combination policy* — replayable, cheap, and `hybrid` becomes an enum value rather
> than a redesign. Read the rest of this section with that correction applied.

**Recommendation: one declared `strategy` field, defaulting to `auto`.**

```
strategy: auto | vector | keyword | hybrid | …
```

- **`auto`** — use vectors if an embeddings connection is active, else keyword. This is exactly
  today's behaviour, and it stays the default, so nothing changes for anyone who doesn't care.
- **The decision is declared, not hidden.** It is a config field the weights lens renders and the
  pipeline view can expose, rather than a branch inside a handler.
- **The outcome is recorded.** The receipt says which path actually ran, so "why did it use
  keywords" is answerable rather than deduced.
- **The future is not cornered.** Adding NER-assisted retrieval, or hybrid rank fusion, is a new
  enum value and a new shape — not a redesign, and not a new node the user has to discover.

**Why this matters beyond ergonomics:** a node that silently picks a strategy internally is control
flow hidden in a leaf, which is the same shape as the adapter-internal failover 01 §10 bans, for
the same reason — the graph can't show it and the receipt can't explain it. A declared strategy
field is the opposite: visible in config, rendered in a lens, resolved in the receipt.

### 2a. Embeddings as a connection

Already the model (01 §10): connection kind = the shape the Provider produces, so `embeddings` is
a connection kind alongside `text-gen`, `tts`, `image-gen`. It is **singleton** — one active
system-wide — and the reason belongs next to the constraint or someone will later "fix" it:
**all stored vectors share one embedding space, so changing the active embeddings connection
invalidates every vector in the database.**

**⚠ Vector rows must record which model produced them.** An `embedding_model_ref` column is cheap
now and impossible to backfill, and it is what turns a model switch from all-or-nothing into
something incremental and diagnosable:

- re-embed only what's stale, in the background, resumable
- detect and report orphans instead of silently returning bad neighbours
- run two models during a migration without corrupting results

Without it, switching embedding models is a destructive operation with no safe path, and the open
question in 13 (re-embed / refuse / orphan) has no good answer available.

---

## 3. ⚠ Context infill is a sub-chain, and there is no way to reuse one

A context infill engine is not a node. It is: retrieve candidates → embed → search → match
triggers → rank → threshold → assemble. Six or seven nodes, most of them configurable.

**Modelling it as one opaque node would be the single most damaging shortcut available in this
design.** The weights lens, the run inspector, "what did it actually retrieve", and the entire
support story for context problems all depend on those steps being separate nodes with separate
receipt entries. Collapse them and SP's headline differentiator stops working exactly where users
need it most.

But modelling it as a sub-chain hits a real gap: **there is no way to reuse a chain fragment.**
Specs are linear and standalone; composition across specs is events (fire-and-forget); async blocks
and maps group nodes but aren't reusable units. So every pipeline that wants context infill copies
seven nodes.

### 3a. Proposal: a compile-time include

A **fragment** is a named, versioned, reusable chain. A spec includes one, and the include is
**expanded at publish** — macro expansion, not a runtime call.

```ts
.include('ctx', contextInfill.v2({ scope: 'chat' }))
```

- **Rows contain the expanded chain.** The spine stays flat and linear; no new runtime construct,
  no hidden control flow, nothing for the executor to learn.
- **Node keys are namespaced by the include** (`ctx.embed`, `ctx.search`, `ctx.assemble`), so
  overrides, receipts, lenses and diagnostics all key on them exactly as they do today (F21).
- **Receipts are per-node**, so the run inspector and the weights lens work unchanged — a user sees
  the seven steps, not a black box.
- **Publish-time expansion means a fragment update doesn't silently alter published specs**, which
  is correct under the versioning model: published rows are frozen, and picking up a newer fragment
  is an ordinary version bump (02 §3).
- The document round-trips: expansion happens before canonical form, so `import(export(rows))`
  identity is untouched (F3).

**This also partly answers 13 §1.** Joined effects were the proposed way to get "run this and use
the result inline"; for *reuse* — which is the actual need here — an include is simpler, keeps the
graph flat, and introduces no runtime machinery at all.

**Needs a ruling.** It is a new SDK primitive and a new authoring concept, but it is compile-time
only, which is the cheapest kind of new thing this design can absorb.

---

## 3b. Two template levels, and rendering can happen in more than one place

There are two distinct Jinja templates in a context pipeline, and conflating them is how prompt
configuration becomes confusing:

| | Lives on | Renders |
|---|---|---|
| **Source template** | a Query, or a Task that renders | one lorebook entry, one message, one card → text |
| **Assembly template** | Assemble | the ordered, allocated blocks → the final context |

**A Query may return raw data, rendered text, or both.** The common case is that it renders its own
items and hands blocks downstream. But a Task can sit between fetch and render:

```
query (raw) → task (manipulate) → task (render) → assemble
```

That is the path for anything the template language shouldn't be doing — deduping against another
source, reordering by a computed score, rewriting entries, merging near-duplicates. The `template`
slot is declared by whichever node type renders, so it appears on Query and on render Tasks alike;
nothing about the slot system changes.

**"Text must exist by the time it reaches the LLM" is enforced by shapes, not by a rule.** Assemble's
input port requires rendered blocks, so a raw-only Query cannot connect to it directly — the
validator catches the missing render step at publish, in the same way it catches any other port
mismatch (01 §3). No new mechanism, and the error names the fix.

## 4. Templates that know their variables

**Requirement:** a Jinja template configured on a node should know which variables are available,
autocomplete them, and flag references to data that node isn't given.

**This falls out of typed ports with no new mechanism.** Every node declares its output shape, so
the set of variables available to node X is the union of the output shapes of everything upstream
of X reachable by `$ref`. The template editor reads that set; publish-time validation checks
against it; unknown references land in `spec_diagnostics` (02 §8).

**Scope it honestly.** Jinja is dynamic — loops, conditionals, computed attribute access. What is
verifiable is **top-level variable references**, which is the overwhelming majority of real
mistakes (`{{ character.name }}` when the node was never given `character`). Verify those, warn
rather than block on anything dynamic, and do not claim full verification. An editor that promises
correctness and then lets a typo through at runtime is worse than one that says what it checks.

**It applies at both template levels (§3b), with different variable sets.** A source template on a
Query sees that source's item shape — `{{ entry.title }}`, `{{ message.author }}`. The assembly
template on Assemble sees the block set and the allocation — `{{ blocks.lore }}`,
`{{ budget.remaining }}`. Both derive from the same typed ports, so the editor offers the right
completions in each place without knowing anything about context infill specifically.

**Available tags come from the same source**, so a plugin's retrieval node contributes its output
shape to the template editor automatically — no registration, no second declaration.

---

## 5. Weights, minimums and allocation

These are ordinary config fields tagged with the `weights` facet, stored as slot values, resolved
through the scope chain, rendered in the weights lens and exposed in the pipeline view (12 §2, 05 §3).
No new mechanism — with one structural caveat that matters.

### 5a. Queries **declare**, Assemble **resolves**

*Revised 2026-08-17. An earlier draft put weights and minimums on Assemble. That was wrong, and the
reason is worth keeping.*

Two different things were being conflated:

| | Where it belongs | Why |
|---|---|---|
| **Declared intent** — this source's weight, minimum inclusion, priority | **the Query** | it is a property of the source, and it is where a user looks to tune "how much should lore matter" |
| **Resolution** — what actually fits in 4,096 tokens given five sources | **Assemble** | only one node holds every candidate and knows the ceiling |

**Why the Query is the right home for the declaration, beyond ergonomics:** if Assemble carried a
`weights: { history: 0.4, lore: 0.35 }` map, that map has to be kept in sync by hand with whichever
retrieval nodes actually exist. Add a source and Assemble's config is silently stale; a plugin
adding a retrieval node cannot participate at all without the spec author editing Assemble.

**Self-describing candidates fix that.** Each retrieval node emits its declared intent as metadata
on the shape:

```
core:shape/context-candidates@1
  { sourceKey, weight, minInclude, priority,
    items: [ { id, data, rendered, order?, depth? } ] }
```

**Items stay a list all the way to the assembly template**, which is what lets a template position
an entry *inside* the history rather than only around it (§5e). The only rule this implies is a
piece of guidance rather than a constraint: a Query that flattens its messages into one opaque
string forecloses positional insertion, so don't.

Assemble reads the metadata off its inputs and allocates. Consequences:

- **Adding a retrieval source requires no change to Assemble** — including a source a plugin
  contributes.
- The weights lens shows `weight` and `minInclude` on the node the user was already looking at.
- Assemble keeps only what is genuinely global: **total budget, truncation policy, and how weights
  normalize** (relative, or summing to one).
- **"Why was this dropped" is still one receipt entry**, because Assemble records the allocation it
  computed and the inputs it computed it from.

Dataflow stays forward-only; nothing flows backwards from Assemble. Assemble is still the flagship
Task — it just reads its allocation inputs instead of duplicating them.

### 5b. The budget is data that flows *forward*, not knowledge that flows backward

A Query wants to know how much context is available so it stops adding low-priority items once
minimums are met. But the two facts it needs — the model's context window and how to count tokens —
belong to a **Provider further down the chain**. That looks like it requires backwards knowledge,
which the whole design forbids.

It doesn't, because of a distinction that has to be made explicit:

> **Configuration is resolved run-wide *before* execution (12 §2). Referencing another node's
> resolved config is therefore not a data edge and creates no dependency in the graph.**

So a Task at the top of the chain reads the generate node's connection and sampling config and
emits the numbers as ordinary forward-flowing data:

```ts
.task('budget', contextBudget.v1({
  connection: slot.connectionOf('generate'),   // config reference, not an edge
  sampling:   slot.samplingOf('generate'),
  params:     slot.params(),                   // { reserveForReply: 512, safetyMargin: 0.05 }
}))
// → { maxContext, reserved, available, tokenizer }
```

Every downstream node that cares takes `$ref('budget', 'available')`. The spine stays linear,
nothing flows backwards, and the dependency is declared and statically checkable.

**⚠ This requires separating connection *metadata* from connection *material*.** F18 says adapters
never hold credentials and core never exposes connection data. That must be read precisely:

| | Readable by a node? |
|---|---|
| **Material** — API keys, tokens, secrets | **never**, by anything, including core node types. Injected per call. |
| **Metadata** — context length, tokenizer id, model name, supported samplers | **yes**, declared by the adapter |

Metadata is not a credential and treating it as one makes budget-aware retrieval impossible.
Extension adapters expose their own metadata for their own connections; core connection metadata is
readable, core connection material is not. That is the same line F18 already draws, stated at the
right resolution.

**Two roles for the budget, and only one of them is authoritative:**

- **Queries use it to avoid waste** — stop fetching once minimums are met and the remaining
  allowance is spent. This is an optimization: getting it wrong costs a bigger candidate set, not a
  wrong answer.
- **Assemble uses it to decide** — it holds every candidate, honours minimums first, then fills by
  priority until the budget is reached. This is authoritative, and it is where "why was this
  dropped" is answered (§5a).

Splitting it this way means a Query that mis-estimates cannot produce a wrong context, only a
wasteful one.

**Token estimates are estimates.** Counting is tokenizer-specific and happens before the call.
**Record estimated against actual in the receipt** — it is the only way anyone discovers the
estimator is drifting, and a silent 10% underestimate shows up as mysterious truncation months
later.

### 5b-i. Which node's config — and the answer is "only ever a Provider's"

The reference above names a node (`connectionOf('generate')`), which raises the general question:
how does any node know whose configuration to read?

**Most of the time it doesn't need to, because almost every slot is node-local:**

| Slot | Shared? |
|---|---|
| `template` | **no** — a source template belongs to the Query that renders, an assembly template to Assemble |
| `prompts` | **no** — authored per node |
| `params` | **no** — the node's own behaviour |
| `connection`, `sampling` | **yes, referenceable** — they describe an *external call*, and only Providers make those |

So cross-node reference is only ever about a Provider's connection and sampling, and only ever to
read **metadata**, never material (01 §10). That is a much smaller question than "how do nodes
share config," and it has a clean answer.

**Two forms, and the implicit one resolves at publish:**

```ts
slot.connectionOf('generate')     // explicit — always unambiguous
slot.downstreamProvider()         // resolved: the first Provider reachable forward from here
```

**`downstreamProvider()` compiles to the explicit form.** Publish walks the edges forward, finds the
Provider that will consume this node's output, and writes the resolved node key into the rows.
Nothing implicit survives into storage, the document, or runtime — the editor shows the resolved
target, and the receipt records it.

Consequences worth having:

- **Ambiguity is a publish error, not a silent pick.** Zero Providers reachable, or more than one on
  distinct paths, fails with a message naming the candidates and telling the author to be explicit
  — the teaching-error pattern (15 §1.3).
- **Inserting a Provider later cannot silently change meaning at runtime**, because the previously
  published rows already hold a resolved key. It changes on the next publish, visibly, in the diff.
- Linearity is what makes resolution well-defined at all: in a linear spine with fan-in, following
  edges forward converges (F25).

**When a spec has more than one Provider**, each keeps its own connection and sampling and the task
view labels them by the node's declared name — *Chat → Summarize: …, Reply: …* — rather than
pretending there is one setting.

### 5c. Ranking is modular because it is a node

Raw queries are never exposed — a Query hook's data access is opaque like any other hook interior
(01 §12.3), and what a user sees is its declared params, not SQL. **Ranking is where the
configurability belongs, and it needs no new mechanism: it is a Task, so swapping rankers is the
existing node-swap override.**

- `rankByRecency@1`, `rankBySimilarity@1`, `rankHybrid@1` — same kind, same shape, so the swap list
  offers them automatically (12 §5) and a user's tuning survives the swap.
- **A plugin ships a ranker by registering a public pipeline hook** with that shape. It appears in
  the same list beside core's, with no registration beyond existing.
- **LLM-based reranking is a Provider, not a Task** — it crosses the boundary (§1), which means it
  is budgeted, recorded verbatim and replayable. That is the right answer and it falls out of the
  Provider/Query line rather than needing a special case.

---

## 6. New model-based retrieval (NER and successors)

Fits without amendment, which is the test of whether §1's line was drawn correctly:

- The **NER call** is a Provider — external, nondeterministic, recorded verbatim.
- **Using its output to fetch** is a Query.
- **Ranking and merging** with other candidates is a Task, or is absorbed by Assemble's allocation.
- It becomes a `strategy` value or an additional fragment step, not a redesign (§2).

**The thing to check when adding each new retrieval mode:** does it need a node whose interior
silently chooses between approaches? If yes, that is the §2 smell again — make the choice a
declared field and record the outcome.

---

### 5e. Depth positioning is a template concern

Inserting a lore entry at a depth *inside* the chat history — between message 4 and 5, as
SillyTavern does — is expressed in the **assembly template**, not by a node and not by a shape:

```jinja
{% for m in messages %}{% set d = loop.revindex %}
  {% for l in lore %}{% if l.depth == d %}{{ l.rendered }}{% endif %}{% endfor %}
  {{ m.rendered }}
{% endfor %}
```

`{% set %}` captures the outer loop's index before the inner loop shadows `loop`. Verified end to
end in `sdk-draft` use case 41.

Two consequences worth stating. **This is why Jinja beats a fixed position enum** — ST offers
before/after character definitions, author's note, or a depth; a template expresses those and
anything else an author invents, with no new enum values. And the *only* requirement it places on
the rest of the design is that items reach the template as a list (§5a), which they already do.

An author who would rather compute placement than express it can do the same work in a Task. Both
are legal; the template is the lighter one.

**⚠ The real gap is in the lorebook model, not the pipeline: SP entries have no `depth` field
today.** The moment an entry carries one, the above works. "Feature missing" and "architecture
can't express it" are different problems and only the first is true.

## 6a. ⚠ Parity with what users already have

SillyTavern's World Info is the incumbent and it is dense: regex keys with logic operators,
three-mode recursion, insertion order, positional insertion (including at chat depth and via named
outlets), constants, per-entry probability, and inclusion groups with weights.

**This document specifies weight, minimum inclusion, priority, strategy and allocation — and none
of those.** They all map without new mechanisms (13 §7i has the table), but they have to be
*built*, and a migrating user meets their absence before they meet the receipt.

Two notes on the mapping. **Positional insertion belongs to the assembly template** (§3b) rather
than to a config enum — Jinja is strictly more expressive than "before character definitions /
after examples / at depth N". And **probability rolls against the run seed** (01 §5), which makes
SP's version replayable where the incumbent's is not: the receipt records which entries won their
roll, and a replay reproduces it exactly.

Treat parity as a checklist against the World Info documentation during U25, not as a backlog item.

## 7. Allocation and wire formatting are two jobs

*New 2026-08-18. Implemented in `sdk-draft/src/wire.ts`, use cases 89–92.*

§3b said Assemble owns an assembly template that renders the final context. That is correct
for exactly one family of connections and wrong for the rest, and the tell was already in the
sample contracts: `renderImage` declared **both** `context: assembled-context@1` and
`prompts: { positive, negative }`. It had half-admitted it did not want prose.

**Assemble was doing two jobs, and only one is modality-agnostic.**

| | What it is | Where it belongs |
|---|---|---|
| **Allocation** | what fits, in what order, honouring weights and minimums, recording why each block is in or out | **Assemble.** Pure, universal, and where "why was this dropped" is answered |
| **Formatting** | blocks → the payload this connection actually accepts | **The Provider**, through a declared `wire` slot |

**Assemble publishes `core:shape/allocated-context@1`** — ordered blocks carrying role, source
key, rendered text, token count and a `why` trail. Not prose. It is assignable to
`assembled-context@1` but **not** the reverse, so core can migrate node by node: a rendered
string has already thrown away everything the panel and the budget need.

**The Provider formats**, through a `wire` slot defaulted from the connection's adapter
metadata:

| Connection | Wire format |
|---|---|
| chat completion | `core:wire/messages@1` — role-tagged array |
| text completion | `core:wire/chatml@1`, `core:wire/alpaca@1` — instruct sequences |
| image generation | `core:wire/fields@1` — the positive/negative fields it already declared |
| anything | `core:wire/plain@1`, or one an adapter registers |

**A slot rather than adapter-internal logic**, for the reason §2 already gives about the
retrieval-strategy switch: a declared field is visible in config, rendered in a lens and
resolved in the receipt; logic inside a leaf is none of those. And **a slot rather than a
node**, because an author swapping Ollama for OpenAI must not have to re-author the spec —
the pipeline never mentions a wire format at all.

### 7a. Which answers "will the queried data and the template overspend?"

Two failure modes hid in that question and only one can actually overspend.

**Too much queried data cannot.** Assemble holds every candidate and drops by policy. That is
§5b's split doing its job: Queries use the budget to avoid waste, Assemble uses it to decide.

**Too much scaffolding can**, because nothing can drop it. After the split it is countable
before the call, because everything reaching the wire is one of exactly three things:

| Source | Known when |
|---|---|
| block content | at Assemble — counted once, at render time |
| template literals and prompt slots | **before execution** — slot values resolve run-wide (F35) |
| wire overhead | before execution — declared by the format, readable as connection metadata (F18) |

There is no fourth category. So the estimate is a **ceiling**: literals exact, per-iteration
literals counted once and multiplied, conditionals taking their largest branch, plus declared
overhead and the safety margin. Per-block counting also errs safely — under BPE, joining two
strings can only merge at the seam, so `count(a) + count(b) >= count(a+b)`.

**Cost profiles are cached by `(template hash, tokenizer id)` and never stored.** They are
execution-affecting — they change allocation, which changes output — so a stored copy that went
stale when someone switched connections would silently produce a different context.

**The formed payload is measured once, at the pre-call substrate**, and estimated-vs-actual is
recorded. **If it exceeds the available budget that is `err`** — not a silent trim, and not a
retry, because a retry means re-invoking Assemble and that is a back-edge the graph cannot show
(F9, F25). It means declared overhead is wrong, and that should be loud.

**The allocation loop must never re-render or re-count.** Count, allocate over integers, format
exactly once. Anything else has a performance cliff at precisely the moment a user's context is
biggest.

### 7b. Debug mode is the same measurement, not a second estimator

A preview run stops at that same pre-call substrate — input resolved, blocks allocated, payload
formed, tokens counted — and halts instead of calling. So **the numbers the panel shows are the
numbers that would have been sent**, and use case 60 asserts byte-identity against a real run.

Every product in this category has a "preview prompt" feature and every one of them is a
reimplementation that eventually disagrees with reality. Here it cannot: same formatter, same
tokenizer, one branch at the end.

It stops at the **first Provider on the spine**, not the literally first — in any retrieval
pipeline that would be `embed` inside the gather block, and previewing a context that had not
been retrieved yet is worse than no preview. A preview costs the retrieval it shows.

### 7c. The `why` trail is what makes the panel worth opening

Each block carries `why: string[]`, and every stage appends one line: the trigger Query says
which key matched at what depth, the rank Task says which inclusion group it won or lost and how
the probability rolled against the run seed, Assemble says whether the budget reached it.

Without it the panel can only say *"dropped — budget"*, which is a token counter. With it:

```
  wire core:wire/messages@1: 14 block + 14 scaffold
  would send 28 tokens · 3/4 blocks included
   ✓ lore                      6 tok
        · key 'pass' matched at depth 1
        · won its inclusion group over "weather-2"
   ✗ lore                     40 tok
        · probability 0.4, rolled out on seed:abc
```

That last line is the one the incumbent cannot produce at all — its probability rolls are
unreproducible, so "why didn't that entry fire" has no answer anywhere.

## 8. Open items this raises

| | |
|---|---|
| **Fragments / compile-time include** (§3a) | new SDK primitive; needs a ruling. Interacts with 13 §1 |
| **Embedding model switch** | re-embed, refuse while vectors exist, or warn and orphan — now answerable *because* of `embedding_model_ref` (§2a), but still a product call |
| **Receipt size for embedding-heavy pipelines** | §1a reduces it; 13 §2's retention policy still needed |
| **Strategy enum membership** | which values ship in 0.6: `auto`, `vector`, `keyword` — `hybrid` and NER-assisted later |
