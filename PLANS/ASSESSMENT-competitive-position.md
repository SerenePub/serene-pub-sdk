# Assessment — Competitive Position of the Pipeline & Plugin System

**2026-08-17. Not normative.** An outside read of where 00–13 lands against the field, scored on
the axes Jody asked about. Landscape checked against current sources rather than recall.

## 0. The field, briefly

| | Extension model | Trust posture |
|---|---|---|
| **SillyTavern** | UI extensions (browser JS) + server plugins (Node, full server access). Install by git URL | "Trust-based system." After a malicious extension ("Bot Browser") harvested API keys via an older backup vulnerability, the response was **transparency about risk rather than restriction** — update, rotate keys, audit your extensions |
| **Open WebUI** | Tools, Functions, Pipes, Filters, Pipelines — all **arbitrary Python on your server**. One-click community install | Explicitly **no sandboxing**, no code review. Docs state plainly: *"Featured does not mean vetted."* Functions are admin-only; no per-user consent exists |
| **LibreChat** | Agents + MCP | MCP-centric; permissioning is coarse |
| **ComfyUI** | Custom nodes, huge ecosystem | None to speak of; the cautionary tale 01/05 already names for UX |
| **Obsidian / VS Code** | The quality bar for plugin ergonomics | Declared capabilities, community trust, no isolation |

Two things follow. First, **nobody in this niche has a real governance story** — the honest ceiling
today is "trust the author, audit yourself." Second, the incumbents' *ergonomic* bar is low
enough that SP's ceremony is the thing to watch, not its capability.

## 1. Power — **strong, with one deliberate ceiling**

**What nothing else in the field has:**

- **Receipts and replay.** Every run recorded — per-node inputs and outputs, timings, verbatim
  model I/O, gate decisions, seed — and replayable without re-inference. No competitor has an
  equivalent. This is the single largest differentiator in the design and it is not close.
- **A review gate below the type layer.** Undetectable and undeclinable by plugin code. Every
  other system's equivalent is a plugin *choosing* to ask.
- **Shape-typed swappability driving the UI.** "Here are the valid replacements for this node" is
  computed, not curated.
- **Per-user consent over what runs against your account** (§3).

**The ceiling, stated honestly:** linear pipelines, no branching. Some things a ComfyUI user does
routinely — conditional graphs, divergent paths that never reconverge — are simply not
expressible. For chat pipelines this is almost certainly the right trade, and async blocks, maps
and halt cover the real cases. But it *is* a capability ceiling, and the ComfyUI-adjacent segment
will find it. Have the answer ready rather than discovering it in a thread.

**Grade: A–.** Deeper than anyone on observability and governance, deliberately shallower on graph
topology.

## 2. Ease of use — **the riskiest axis**

**Genuinely good:** the L2 lens transpose is the strongest UX idea in the set — pick the *aspect*,
not the node. It matches how people actually arrive at the editor, and nothing in the field does
it. The non-admin flat list, the run inspector, "open the run, weights lens, look" — all real.

**The risk is vocabulary mass.** A user eventually meets: pipeline, node, kind, slot, preset,
scope, facet, event, subscription, consent, permission, plugin, extension, component. SillyTavern's
competing concept for "change how the bot talks" is *a text box*. Progressive disclosure is
designed for, but the ladder is long.

**⚠ The bigger problem, and it isn't in the docs anywhere: the single-user install pays the
multi-user tax.** Most SP installs are one person on their own machine. For them, admin-vs-user,
per-user consent, permission grants, and plugins-off-by-default are pure ceremony protecting them
from themselves. If a solo user has to grant permissions as admin and then consent as user to the
same plugin, the safety design reads as pointless clicking — and that is the review the design
will get.

**This wants a solo mode where the ceremony collapses**: single-account installs auto-consent, the
consent screen becomes a review surface rather than a gate, and the distinction reappears the
moment a second account exists. Cheap to design now; a retrofit later means changing the consent
data model everyone depends on. **This is the most valuable gap in the assessment.**

**Grade: B, with a clear path to A** if the solo case is designed rather than inherited.

> **Update, same day — both issues addressed, revised grade A–.** Ruled: pipeline customization
> and advanced tooling are hidden by default behind a system setting, and the front door is a task
> view — active pipelines, including every registered chat type, as configurable tasks with no
> topology (05 §0a). Separately, an admin's own action implies their own consent and the consent
> UI disappears entirely when accounts are disabled (11 §4a), so the solo install pays no
> multi-user tax.
>
> Both fixes are better than what this assessment asked for. The vocabulary-mass problem largely
> dissolves — a user never meets node, slot, facet, scope or subscription unless they go looking —
> and the concepts stop being a ladder to climb and become a door to open. The one thing to watch
> is the remaining terminology collision between the user-facing "task" and the **Task** node kind
> (13 §7b).

## 3. Safety — **the strongest position in the field, by a distance**

Set against the actual state of the art:

| | SillyTavern | Open WebUI | **SP as designed** |
|---|---|---|---|
| Sandbox | no | no (stated) | no — and says so |
| Runtime permission enforcement | no | no | **yes**, against hash-verified manifest + admin grant |
| Per-user consent | no | no | **yes**, default-deny |
| Write gating by end users | no | no | **yes** |
| Kill switch | no | no | **yes**, global, default-off |
| Audit trail of what a plugin did | no | no | **receipts** |
| Automated account/content deletion | possible | possible | **prohibited by law** |

The SillyTavern key-theft incident is the exact scenario this design answers: credentials never
reach plugin code, plugin credentials aren't SP's to leak, permissions are checked at the call and
not merely declared, and receipts would have shown what the extension actually did.

**Three honest caveats:**

- **This is governance, not isolation** — the docs say so, which is itself a credibility asset in a
  field where the word "secure" gets used loosely.
- **Consent fatigue is real.** Accept-all is the escape valve most users will take on day one, at
  which point the model's protection is only as good as the admin. That's still strictly better
  than the field, but don't count consent as protection in aggregate.
- **The permission generator is static analysis** and will produce false negatives. The docs
  already refuse to call it a boundary. Keep refusing.

**Grade: A.** The differentiator most likely to matter to anyone running an instance for other
people.

## 4. Community response — **polarized, and predictably so**

**Will land well:** receipts and debuggability with power users; "dungeon crawler mode becomes a
spec somebody ships" as a pitch; repository-driven releases with an official list, which mirrors
what the audience already knows; and multi-user instance operators, who currently have nothing.

**Will generate friction, in likely order of volume:**

1. **Plugins off by default + admin-only install + consent** reads as "locked down" to a community
   whose norm is dropping a JS file in a folder. Mitigated almost entirely by §2's solo mode; not
   mitigated at all by explaining the reasoning.
2. **The solo-user tax** (§2). Expect this as the top complaint if unaddressed.
3. **No branching** from the graph-tinkerer segment.
4. **Migration anxiety** — existing users' prompt configs and templates must visibly survive. The
   config model handles it; the *messaging* needs to lead with it.

**Positioning suggestion:** lead with the receipt, not the pipeline. "See exactly what your bot
did and why, and replay it" is a benefit anyone understands. "Versioned specs with typed node
pins" is an implementation detail that sounds like work.

### On the announcement line

*"Not your mother's 'engine'"* has energy and a clear target — it scare-quotes the category's
favourite word, which the audience will read instantly. Three things it doesn't do: it makes a
joke about the category rather than a claim about the product; the idiom is dated and US-centric,
so part of the audience meets it cold; and it aims at peers SP is actively recruiting *from*,
which reads as swagger to some and as punching at neighbours to others.

**None of that argues for dropping it — it argues for a second line underneath.** A hook plus a
claim:

> **Not your mother's 'engine'.**
> It shows its work — every prompt, every call, every decision, replayable.

**The stronger riff:** *"We stuffed a Formula 1 engine into a Toyota Tacoma."* It works better than
the first line for a reason worth making explicit — **F1 cars are the most instrumented machines on
earth**, every session logged and replayed afterward by engineers working out what actually
happened. That is the receipt. The metaphor lands on the differentiator rather than gesturing at
effort. It is also self-deprecating about the truck instead of sniping at peers, and the Tacoma
half quietly promises the task-view-by-default decision: it is still a truck, you can still just
drive it.

> **We stuffed a Formula 1 engine into a Toyota Tacoma.**
> Full telemetry. Still starts every morning.

Both halves become claims — telemetry is the receipt; starts every morning is vanilla-by-default,
the regenerate contract, and an app people self-host for years. Anticipate the obvious reply (F1
engines are famously unreliable and rebuilt constantly); the Tacoma half answers it, but answer it
on purpose rather than in a thread.

"Shows its work" is worth considering as the durable line on its own. It *is* what receipts are, it
lands for both audiences at once (a user asking why the bot said that; a developer diffing two
runs), it keeps the word "engine" rather than sneering at it, and it's warm instead of combative —
which matters when the people you're pitching to built the thing you're scare-quoting.

**For the SDK announcement specifically**, the audience is modders, and they have three questions:
*can I build what I want · will my plugin break · will anyone install it.* Answer them in order —
sixty seconds to a working plugin, an honest breaking-changes policy for the preview, and the
example repo as proof. Then the line they've been burned on everywhere else, which SP can make
truthfully: **core has no privileges your plugin doesn't.**

**Grade: B+.** Strong with operators and power users, needs deliberate handling of the solo
majority.

## 5. Mod developer pleasure — **best-in-class, with a real onboarding cliff**

**Better than anything in the field:**

- **Typed end to end**, with fat-fingered ports dying in tsc rather than in a receipt.
- **A conformance kit that runs in the author's CI.** Nobody else ships this. "Works as a
  surface/binding" becomes provable rather than reported.
- **Goldens from receipts** — regression tests for prompt pipelines, which currently don't exist
  anywhere.
- **`contrib/` → lift out to your own repo.** The best on-ramp in the category; SillyTavern starts
  you at "make a repo and guess," Open WebUI at "paste Python into an admin panel."
- **Framework-neutral UI with three first-party adapters**, versus SillyTavern's implicit
  jQuery-era DOM coupling.
- **Descriptor/binding split** — the editor configures your type without loading your code.

**The cliff:** writing a dice roller requires meeting five kinds, shapes, pins, slots, facets,
descriptors-vs-bindings, four access levels, and a ~20-field manifest. In SillyTavern you export a
function. Every SP constraint is justified; the problem is that a modder can hit three
prohibitions in one afternoon — no branching, no peer calls in a run, no network in a Query — and
feel fenced rather than guided.

**The fix is documentation placement, not design:** the *why* must arrive at the moment of
collision, in the error message and the lint, not in a constitution nobody reads. An error that
says "Queries can't reach the network — use a Provider so the call is recorded and replayable"
converts a prohibition into a lesson. The example plugin is the other half of the mitigation, and
it's a good one.

**Grade: A– for sustained development, C+ for first-hour experience.** The gap between those two
numbers is the whole risk.

> **Update — 15-QUALITY-BAR targets this gap directly.** The four that close it: a scaffold that
> produces a *working, installed, rendering* plugin in under sixty seconds; a dev loop that doesn't
> restart SP; every prohibition error naming what to do instead; and one command that prints a
> readable receipt. With those, first-hour moves to A–. Without them the C+ stands regardless of
> how good the architecture is, because nobody experiences architecture in their first hour — they
> experience setup, iteration speed, and error messages.

## 6. Ease of development for core — **the scope is now a program, not a release**

U1–U26 plus migration plus a three-framework example plugin. Honest read: **0.6 as scoped is
several releases of work**, and the units most likely to overrun are the ones with no precedent to
copy — U17 surfaces with three adapters, U19 the inspector, U21 consent.

Worth considering a 0.6 / 0.6.5 split: engine, permissions and migration first; components,
consent and the inspector second. The manifest is already designed as the 0.6/0.7 seam; a second
seam inside 0.6 costs little and de-risks the first ship.

## 6a. Context construction — the real battleground *(added 2026-08-17)*

Plugins are the strategic question. **Context construction is the daily one.** It is what this
audience actually spends its time on, argues about, and writes guides for, and since 16 and 17 it
is where SP competes head-to-head with SillyTavern's core competency rather than around it.

### What SillyTavern actually has

Generously and accurately: a mature, dense feature set built over years.

| | |
|---|---|
| Activation | plaintext keys, **regex**, logic operators (AND ANY / AND ALL / NOT ANY / NOT ALL), scan depth |
| **Recursion** | entries activate other entries, with three modes — non-recursable, prevents-further, delayed-until-recursion |
| Ordering | insertion order, "larger order inserted closer to the end" |
| Position | before/after character definitions, before/after examples, author's note, **at a specific chat depth**, named outlets |
| Budget | a Context % allocation for World Info |
| **Probability** | per-entry trigger percentage |
| **Inclusion groups** | competing entries share a label; group weight or deterministic prioritize |
| Vectors | 20+ embedding providers; indices partitioned by user/source/collection/**model**; `score_threshold` default 0.25 |

Partitioning vector storage by model is notable — it is the same instinct as
`embedding_model_ref` (16 §2a), reached via directory structure.

### What it doesn't have, and it's the whole opening

**None of it is observable.** From the docs: *"when the budget exhausts, no additional entries
activate regardless of keyword presence"* — **silently**. There is no record of which entries fired,
which lost a group competition, which lost a probability roll, or which were dropped at the budget
line. The vector side has "no diagnostic tools mentioned for monitoring retrieval quality or index
health," and model-change migration is undocumented.

So the honest comparison is not *SP has more features*. It is:

> **SillyTavern gives you more knobs and no way to see what they did. SP gives you fewer knobs and
> a complete record of what happened.**

The receipt in 17 §4 answers, unprompted, three questions ST cannot answer at all: which entries
were included and at what weight, what was dropped and why, and whether retrieval used vectors or
keywords.

### ⚠ The honest gap: SP's spec is not at feature parity

SP's context infill currently specifies weight, minimum inclusion, priority, strategy and
allocation. It does **not** specify probability, inclusion groups, recursion, regex keys, or
positional insertion at depth. Those are real features ST users depend on daily, and a migrating
user will feel their absence before they feel the benefit of receipts.

**The reassuring part: every one of them maps into the existing model as params or template logic,
not as new mechanisms** — the same pattern as everything else this session.

| ST feature | Lands as |
|---|---|
| regex keys, logic operators, scan depth | `params` on the trigger Query |
| recursion | bounded scan inside the Query's opaque interior, with a declared depth param |
| constants | `priority: always`, or a minimum that always clears |
| inclusion groups, group weight | the rank/merge Task's job — it already exists (16 §5c) |
| insertion order and position | the **assembly template** (16 §3b), which is Jinja and strictly more expressive than a fixed enum |
| probability | entry data read by the Query, rolled against the **run seed** |

> **Claim tested 2026-08-17.** All seven were implemented in the draft SDK
> (`src/worldinfo.ts`, use cases 35–41) and **all seven mapped with no new mechanism.** Depth
> positioning turned out to be the assembly template's job — a loop over messages with `{% set %}`
> capturing the depth — which is also the answer to why Jinja beats a fixed position enum: it
> expresses ST's four positions and anything else an author invents. 13 §7i has the table.
>
> **The real parity gap is narrower than this section implies: SP's lorebook entries have no
> `depth` field.** That is an entry-schema addition in the lorebook model, not pipeline work.

That last row is the one place SP is better on the feature itself rather than on visibility.
**ST's probability rolls are unreproducible** — an entry fired or didn't and you cannot find out
why or replay it. SP's roll comes from the run's recorded seed (01 §5), so it is deterministic under
replay and the receipt says which entries won their roll. A feature that currently makes debugging
harder becomes one that doesn't.

**Recommendation: treat ST feature parity as a 0.6 migration requirement, not a later nicety.**
The `contextInfill` fragment is the natural home, and shipping it short means the comparison every
migrating user runs — "can I rebuild my lorebook setup?" — comes back no, regardless of how good
the receipts are.

## 7. ~~⚠ Strategic gap: MCP is unaddressed~~ — CLOSED same day, see 14-MCP

Nothing in 00–13 mentions the Model Context Protocol. Meanwhile Open WebUI and LibreChat both ship
MCP support, and SillyTavern has community MCP bridges.

This matters because **SP is architecturally ready for it and would inherit an ecosystem instead
of bootstrapping one.** A Provider or Query speaking MCP fits the existing design exactly:
`runtime: process` already spawns and speaks to a sidecar over stdio, connection kinds are already
shape-typed, and every MCP call would land in a receipt — which no other MCP client does.

That last point is the interesting one. "MCP tool calls, recorded verbatim and replayable, gated
by the review gate before anything writes" is a genuinely differentiated pitch into a space that
currently offers MCP with no audit trail and no gating.

**Recommendation: add a core MCP Provider/Query type to the 0.7 sketch at minimum**, and check
that nothing in the 0.6 shape registry forecloses it.

## 8. Summary

| Axis | Grade | Determining factor |
|---|---|---|
| Power | A– | Receipts and replay; ceiling is linearity. MCP adds reach without adding surface |
| Ease of use | **A–** *(was B)* | Task view as the front door; solo installs pay no multi-user tax |
| Safety | A | Only real governance model in the field — now extended over MCP, which nobody else gates |
| Community | **A–** *(was B+)* | The two predicted friction sources are addressed; lead with the receipt |
| Mod developer | A– / C+ | Sustained joy, first-hour cliff — unchanged, and now the main remaining risk |
| **Context construction** | **A on visibility, incomplete on features** | §6a — the daily battleground. Strictly better observability; not yet at SillyTavern feature parity |
| Core effort | — | Scoped as a program; consider a seam inside 0.6 |

### Two later additions that widened the lead quietly

**Modality agnosticism.** TTS, image generation and LLM calls are the same object to the config
model, the lens view, the task view, export and permissions, because `params` is declared per type
rather than per kind (17 §1). In SillyTavern each is a separately-built subsystem with its own
settings UI and conventions. Adding music generation to SP touches nothing; adding it to a
competitor is a project.

**Bounded execution.** Every hook, sidecar call and scheduled job has a declared timeout and an
admin ceiling (F36), alongside consumption budgets (F13). In a field whose norm is "arbitrary
Python on your server, indefinitely," that is the difference between an instance operator being
able to run other people's plugins and not.

**The headline is the receipt.** Everything else here is competent-to-excellent design; run
observability and replay is a category difference that no competitor has, and it is what makes
both the safety story and the debugging story credible at once.

**The second headline is that core has no privileges.** SillyTavern's core is privileged over its
extensions; SP's is not, by law. That is the structural reason a third-party ecosystem could end
up better here than anywhere else in the field — and it's worth saying out loud in developer
messaging, because it's the promise modders have been burned on elsewhere.

**Sources:** [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) ·
[SillyTavern vector storage / RAG](https://deepwiki.com/SillyTavern/SillyTavern/6.3-vector-storage-and-rag-system) ·
[SillyTavern Data Bank](https://docs.sillytavern.app/usage/core-concepts/data-bank/) ·
[SillyTavern extension incident PSA](https://github.com/SillyTavern/SillyTavern/discussions/5592) ·
[SillyTavern server plugins](https://docs.sillytavern.app/for-contributors/server-plugins/) ·
[SillyTavern UI extensions](https://docs.sillytavern.app/for-contributors/writing-extensions/) ·
[Open WebUI plugin model](https://docs.openwebui.com/features/extensibility/plugin/) ·
[Open WebUI pipelines](https://docs.openwebui.com/features/extensibility/pipelines/) ·
[Open WebUI MCP](https://docs.openwebui.com/features/extensibility/mcp/) ·
[LibreChat MCP](https://danny-avila-librechat-89.mintlify.app/features/mcp) ·
[SillyTavern MCP feature request](https://github.com/SillyTavern/SillyTavern/issues/3335)
