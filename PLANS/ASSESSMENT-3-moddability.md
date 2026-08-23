# Assessment 3 — Moddability, and what a developer can actually build

**Date:** 2026-08-18. Written against 00–17 as they now stand, plus `sdk-draft/` at 198 tests.
Supersedes nothing; ASSESSMENT-competitive-position and ASSESSMENT-2-framework-standing still hold
on their own subjects.

**Question asked:** how does SP look for moddability against the competition, and will developers be
able to build genuinely unique and powerful extensions?

---

## 0. The verdict, before the reasoning

**SP's extensions will be markedly more composable and more trustworthy than the incumbent's, and
meaningfully less omnipotent.** That trade is deliberate and mostly correct. It is also the
strategic risk, because the modding audience for a self-hosted roleplay app skews toward people who
value omnipotence.

Two things are true at once and both should be said out loud:

- On the axes SP chose — composability, consent, explicability, upgrade safety — **there is nothing
  in this category close to it**, and several of the mechanisms have no equivalent anywhere.
- On raw reach, **SillyTavern extensions can still do things SP extensions will never be allowed to
  do**, and a large fraction of the existing modding community defines "powerful" exactly that way.

The honest read is that SP is not competing for the same modder. It is building the ecosystem that
becomes possible *after* an ecosystem exists — and it has to survive the gap in between.

---

## 1. What is genuinely differentiating

Ordered by how hard it would be for a competitor to copy.

**The receipt, and replay that never re-infers.** Every decision recorded, every Provider request and
response verbatim, per-node timings, the run seed, gate resolutions, which sampler fields the
adapter actually honoured. `replay(receipt)` reproduces a run without calling the model. Nothing in
the category does this. The incumbent cannot answer *"why didn't that lorebook entry fire"* at all;
SP answers it from a row. **Hard to copy** because it has to be designed in from the executor
outward — it is not a logging feature.

**The debug preview is the same measurement as the send.** Not a parallel estimator that drifts —
the run stops at the pre-call substrate and reports the payload that would have gone out, from the
same formatter and tokenizer. Use case 60 asserts byte-identity. Every product in this category has
a "preview prompt" feature and every one of them is a reimplementation that eventually disagrees
with reality.

**The review gate, keyed on declared effects and living in the executor substrate.** Any node that
can write or reach outside is gateable, whatever its kind. An author may default it **on** and there
is no value that forbids it — the enforcement is that the option does not exist. A user can require
approval before anything touches their data. **No competitor has a consent model at this
granularity**, mostly because the category is historically single-user.

**Per-user permission gating in a multi-user instance.** A non-admin can block an admin-installed
extension from writing their data, and cannot block it from reading — a line drawn deliberately.
Combined with users being told that admins can audit them, this is a governance story the category
simply does not have.

**Laws as compile errors.** No back-edge is writable, because the scope handed to each step contains
only what precedes it. A Provider constructor in `.query()` is a type error. A preset addressing a
node that does not exist will not compile. `types.assert.ts` fails the build if any of those stops
being true. The incumbent's equivalent is a runtime exception in the browser console, if you are
lucky.

**Modality agnosticism that actually holds.** TTS, image generation and MCP tools are the same object
to the config model, the scope chain, the lens view and the receipt, because `params` is declared per
type rather than per kind. Adding a modality touches none of them. In the incumbent each is bolted
on separately with its own settings surface.

**Deterministic randomness.** Probability rolls go through the run seed, so they replay and the
receipt records which entries won. The incumbent's equivalent fires or doesn't with no way to find
out why — a feature that currently *makes debugging harder* stops doing so.

---

## 2. What a developer can build that they could not before

Concrete, not aspirational — each of these is a declared mechanism with tests behind it.

**A ranker, in one file.** Register a public pipeline hook with the ranking shape and it appears in
every user's swap list beside core's, with no registration step and no UI work. A user's tuning
survives the swap because the shape matches. **This is the cleanest extension point in the design**
and it has no incumbent equivalent — ranking there means patching the prompt builder.

**A template engine.** Ship Handlebars, a custom DSL, anything — register `render`, `extract`,
`check` and `costProfile`, and it works everywhere templates work. An engine that cannot analyse its
own token cost is still legal; it declares `exact: false` and costs its users context headroom
rather than correctness.

**A schema source.** Declare a new variable type — relationships, inventory, faction standing, quest
state — and users can write variable templates against it, rendering it as prose in one pipeline and
JSON in another. The data stays wherever the extension keeps it; only the *shape* is declared. This
is probably the most under-appreciated surface in the design, and it is how an extension adds a new
*kind of thing* to the world rather than a new button.

**A chat type.** A chat-shaped pipeline registers as a mode and appears in the picker with its own
configurable options, its own prompts, its own retrieval. "Ship a new kind of chat" is a spec, not a
fork. For a roleplay product this is the largest creative surface available, and it is nearly free.

**A preset pack for someone else's pipeline.** Owned separately, uninstalls cleanly, does not take
the pipeline with it.

**A reusable retrieval fragment.** Seven nodes as a named, versioned unit, expanded at publish so the
run inspector still shows seven steps rather than a black box.

**MCP tools as Providers** — budgeted, recorded verbatim, and gated by default until an admin
classifies them read-only.

The common thread: **these compose.** A ranker from one plugin, a template engine from another and a
schema source from a third all work together without any of the authors having coordinated. That
property does not exist in the incumbent, where two extensions patching the same thing is the normal
failure mode.

---

## 3. The three real constraints, ranked

### 3.1 ⚠ No branching, and tool-calling loops are the case that exposes it

**This is the most serious limit on "unique and powerful," and it has become more serious since the
ruling was made.** F25 forbids branching; iteration is `map` over a known list with a declared max;
conditionals are `halt`. That covers a great deal — and it does not cover the shape that has become
table stakes:

```
call model → model returns tool calls → execute them → feed results back → call again → until done
```

That is a loop with a data-dependent exit. `map` cannot express it, because the list is not known up
front. `halt` ends the run rather than the iteration. Events are fire-and-forget and cannot rejoin.
So today an author has exactly one option: **do the whole loop inside a Provider hook**, which makes
it one opaque call in the receipt — losing per-step timings, per-step review, per-step budget, and
the entire explicability story precisely where it matters most.

**The design's own principles argue against leaving this.** SP has refused hidden control flow in
adapter failover, in the retrieval-strategy switch, in the create/update question and in the
over-budget retry. A tool-calling loop hidden in a hook interior is the same smell, and it is the one
users will hit first.

**Recommendation: treat bounded agentic iteration as a 0.7 design item, not a non-goal.** The
material already exists — a map produces `branch-results`, halt is a first-class outcome, budgets
meter consumption, and the cycle checker handles depth bounds. What is missing is a construct that
repeats a chain until a declared predicate or a declared maximum, with every iteration a separate
receipt entry. That is closer to `map` than to a loop node, and it does not need an accumulator (the
thing that would have made it a State kind).

### 3.2 The spine is honest; the interiors are not

The strongest claim in this design is *"no hidden control flow"* — and it is true **of the spine**.
It is not true of hook interiors, which are opaque by construction (01 §12.3), and the more the spine
restricts, the more complexity gets pushed inside them.

That is not a flaw exactly; a Query's SQL was never going to be in the graph. But it means the honest
version of the pitch is **"the shape of what happened is always legible, and the inside of each step
is as opaque as anyone else's"** — not "everything is visible." Overclaiming here would be found out
by the first person who opens a plugin.

The mitigation that already exists and should be leaned on: the *incentive* runs the right way.
Splitting work into more nodes buys receipts, review, budgets, swappability and preset surface. An
author who hides logic gets none of that. The design does not have to forbid opacity if it makes
transparency obviously worth more.

### 3.3 UI extensibility is deliberately narrow

Declared surfaces, virtualized, with the chat message as the flagship. The incumbent lets an
extension put arbitrary DOM anywhere. **A developer who wants to add a whole new panel cannot,
unless a surface exists for it** — and every new surface is a core release.

The reasoning is sound (native performance, no per-extension runtime, styling that survives theme
changes) and the tiering plan is right. But it should be understood as a real ceiling, and the
surface list should be treated as a **product backlog with a fast cadence**, not a fixed set. The
number of surfaces shipped per release is a direct measure of how much creativity the platform
permits.

---

## 4. Two smaller costs worth naming

**Distribution friction.** Bundle every dependency per platform, verified at install. Correct for
reliability, and it is strictly more work than dropping a JS file into a folder. Curation carries the
quality bar rather than mechanism, which is the right call — but the first-time author's path from
idea to installed plugin is longer than the incumbent's, and that is where ecosystems are won or
lost.

**No plugin-defined events in SDK 1.0.** Loose announce-and-listen coupling between extensions does
not exist; only the tight form (pinning a public pipeline hook). Deliberate, reopenable additively,
and the right 0.6 call. It does mean *"my extension's data changed, run something"* has no path, and
that is a shape people will ask for.

---

## 5. The strategic risk, stated plainly

Design quality does not beat ecosystem gravity. The incumbent has years of extensions, a community
that knows its patch points, and a modding culture built around unrestricted access. SP is arriving
with a better architecture and no ecosystem.

The people most likely to write extensions for a self-hosted roleplay app are hobbyists who value
being able to do anything, immediately, with a text editor. SP's answer to that person is *"here are
guardrails you did not ask for and a build step."* Some of them will bounce.

**What converts them is not the architecture argument — it is the payoff being visible in the first
hour.** The concrete versions of that:

- **The ranker case.** One file, appears in everyone's swap list, no UI work. If that is genuinely a
  ten-minute experience, it does more than any document.
- **The receipt.** The first time someone debugs a context problem by scrubbing a run instead of
  adding print statements, the argument is made.
- **The preview.** Seeing the exact payload with per-source token counts and drop reasons is
  something the incumbent's users currently do by hand.
- **Extensions that do not break on update.** Pinned types, frozen published rows, permission diffs
  that do not auto-grant. This is invisible until it saves someone, and then it is decisive.

**The recommendation that follows:** spend disproportionate effort on the *first-hour* experience of
the example plugin (U26) and on shipping the run inspector and preview early and prominently. The
governance and composability arguments are correct and they convince nobody in advance.

---

## 6. Summary

| | Incumbent | SP as designed |
|---|---|---|
| Raw reach | ✅ near-total | ⚠ bounded by declared surfaces and F25 |
| Composability | ❌ two extensions patching one thing collide | ✅ shapes and swap lists |
| Explicability | ❌ | ✅ receipts, replay, preview |
| Consent / multi-user | ❌ | ✅ per-user, per-effect |
| Upgrade safety | ❌ | ✅ pins, frozen rows, slugs, ownership |
| Agentic loops | ✅ arbitrary JS | ⚠ **not expressible on the spine — §3.1** |
| New chat modes | ⚠ heavy | ✅ a spec |
| New variable kinds | ❌ | ✅ schema sources |
| New template languages | ❌ | ✅ engine registry |
| Time-to-first-plugin | ✅ minutes | ⚠ a build step |
| Ecosystem today | ✅ years of it | ❌ none |

**Will developers be able to build very unique and powerful extensions?** Yes — and along axes the
incumbent has no answer for: new chat types, new variable kinds, new template languages, rankers and
retrieval strategies that drop into everyone's existing pipelines. What they will *not* be able to
do is rewrite the application from inside an extension, and one genuinely important shape — the
bounded agentic loop — is missing rather than forbidden and should be designed before 0.7.
