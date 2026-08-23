# 05 — The Task View, the Lens View, and the Run Inspector

**Status:** Consolidated 2026-08-17. Folds in the linear spine (F25), the configuration model
(12-CONFIGURATION), the default pipeline view, and the run inspector's timeline scrubber.

## 0. Three levels, and only the first is on by default

**Pipeline customization and the complex tooling are hidden by default and enabled at the system
setting level.** What everyone gets out of the box is the **pipeline view** (§0a). The lens view (§1–§5)
and any structural editing appear only once an admin turns them on.

This is the single most important decision for how the system feels. Everything below §0a is
opt-in depth, not the front door.

### 0a. The pipeline view — the default, for everyone

An adapted, extended form of today's prompt-configs sidebar. **Active pipelines are presented by
name, with configurable options.**

> **Vocabulary corrected 2026-08-18 (13 §7b).** The default view says **pipeline**; lowercase
> "task" is retired, and **Task** is the node kind and nothing else. A pipeline is **enabled**
> (installed and permitted), **active** (selected for this chat, or subscribed to an enabled
> event), **triggered** (running or queued) or **inactive** (01 §1) — states a user can read,
> rather than a second word for the same object. Read "task" as "pipeline" wherever older copy
> below still says it.

- A flat list of the things SP does for you — replying in chat, summarizing, extracting lorebook
  entries, whatever else is active — each with a handful of options.
- **Registered chat types are tasks too.** A chat-shaped pipeline declaring itself a mode (06 §2)
  appears here as its own configurable task: "Standard Chat", "Dungeon Crawl", each with its own
  prompts and options. So the mode picker and the task list are two views over the same rows — the
  picker chooses which mode a session runs, the task list configures it. A plugin shipping a chat
  mode therefore adds a configurable task with no extra UI work anywhere, which is the payoff of
  modes being specs rather than app modes.
- Scope follows the normal chain (12 §2): configuring a chat type from the task list writes at
  user scope; configuring it from inside a chat you own writes at chat scope.
- Options are the slot values a user is permitted to write (12 §4): prompts, and where allowed
  templates and settings. Connections stay admin-only and mostly invisible here.
- **No topology.** No node keys, no step counts, no structure inferable from the DOM. A task is a
  named thing with options, not a graph you can't see.
- Sourced from the same rows as everything else, so a plugin's task and its options appear here
  automatically — nothing to author twice.
- **The run inspector stays available in a simplified form** even here. "Why did the bot forget my
  character's sister — open the run and look" is the most valuable thing SP offers a normal user,
  and hiding it behind an advanced toggle would waste it.
- **Live progress shows against the task, not the node** (04 §4a). A running task can report what
  it is doing — "downloading runtime", "summarizing chunk 12 of 64" — with a cancel control beside
  it. Core supplies the attribution so plugin-authored text can never leak node keys or structure.

**⚠ Terminology collision to resolve before UI copy.** "Task" is already a node kind — pure
computation, 01 §2 — and now also the user-facing word for an active pipeline. The two audiences
barely overlap (developers read the SDK; users read the sidebar) so this may be tolerable, but it
must be a *decision*, recorded in 01 §1, rather than a coincidence. Alternatives if a clean split
is wanted: **Routine**, **Job**, or **Behavior** for the user-facing term. See 13-OPEN-RULINGS.

**This resolves L1's fate.** The old recommendation was to fold L1 into L2 as a collapsed spine.
The default is now not a collapsed spine at all — it's a task list with options, which is a
simpler and more honest thing for someone who never wants to see a pipeline.

## 1. The inversion (lens view — advanced, opt-in)

Every node editor organizes config **per node** — click a node, get a drawer of twelve settings,
mentally join across drawers to answer "which template does this pipeline actually use where?"
The lens view transposes the matrix: pick the **aspect**, and every node projects only that facet.
Map layers — same geography, switch terrain/traffic. It matches intent: nobody opens the editor
wanting "node 7's settings"; they want "change how the bot talks." The lens *is* the question
they came in with.

## 2. The spine

- **The spine is literally linear.** With branching dropped (F25), the vertical timeline is no
  longer "honest for the common case" — it is honest, period.
- **Async blocks and maps render as grouped rows** — side-by-side chains for a block, a single
  block marked "× N" for a map. Both show their `sequential | parallel` mode and whether an admin
  forced sequential.
- Nodes not participating in the active lens are **dimmed, never removed**. The skeleton is
  identical across mode switches or users never build a stable mental map. Long dimmed runs
  collapse to an expandable ellipsis; **position is sacred**.
- **Toggleable nodes show a toggle** — but only those whose descriptor grants it, which requires
  output shape assignable to input shape. A node that isn't shape-transparent can't be switched
  off without breaking everything downstream, so the UI can't offer what the type didn't declare.
- Consumer blocks grow **event chips** with live status; clicking one descends into the triggered
  pipeline's own spine (never inlined).
- The review card, when a run parks at `sync`, **is** the Consumer block, expanded in place — the
  run's timeline visibly stops there.
- **Halt renders as a stop, not a failure.** A halted run shows the halting node and its recorded
  reason. Conflating halt with error here is how "why did nothing happen" becomes unanswerable.

## 3. Lenses = facets, declared not hardcoded

- Facet tags live in **type descriptors**, per config field: `templates`, `weights`, `connection`,
  `prompts`, `review`, … The mode switcher is generic: the lens set is the union of facets
  declared by installed types. A plugin Query's retrieval sliders land in the weights lens next to
  core's, automatically.
- Default facet blocks are **schema-generated** (tagged fields → form controls, with optional
  titles, descriptions and control-type hints). Rich blocks register via
  `core:surface/facet-block@1` (incubating, core-internal).
- Governance: core facets are canonical and ordered; plugin-tagged config **joins existing
  facets** by default; net-new facets go behind an overflow.

## 4. The write path

L2 writes **overrides only** (F20), per slot, at the scope the user is permitted to write
(12-CONFIGURATION §4). Consequences:

- Simple users are structurally incapable of breaking a pipeline from this view: dangling edges,
  kind violations, invalid topology are not reachable.
- "Reset this lens to defaults" = DELETE scoped to the facet's paths.
- No warning dialogs doing a schema's job.
- **Node type swaps** — same kind, exact shape match — are offered as a constrained override so a
  user's tuning survives upgrades. Orphaned slots land in diagnostics, never silently dropped
  (02 §7).

## 5. Shared bindings

When three nodes reference the same prompt config: badge the blocks ("used by 3 nodes") and offer
**swap-here vs. swap-everywhere**. The vertical view is what makes duplication visible at all.
Reference — not inline — is what keeps the door open for presets, which are named selections of
slot values across a pipeline (12-CONFIGURATION §3).

## 6. The run inspector — same spine, plus a scrubber

Because it's a timeline, the spine renders **runs**: during execution the progress indicator
descends it; afterward the **receipt hydrates it**. One component, two data sources.

Full run logs are stored (`receipts` + `receipt_nodes`, 02 §2), which makes the inspector
concretely:

- **A timeline scrubber.** Drag through the run and watch node activity; each node shows when it
  became active and for how long.
- **Trigger attribution at the top:** who and what started this — a user message, an event and
  which one, a scheduled hook, a UI action, or a parent run. Descend to the parent, or out to the
  children.
- **One node at a time, with a global overview.** Select a node to see the exact data passed in
  and out, attempts, cache hits, and for Providers the verbatim request and response.
- **Lenses work on receipts.** Switch a past run to the weights lens and see not what Query nodes
  are *configured* to retrieve but what they *actually* retrieved. "Why did the bot forget my
  character's sister" stops being a support ticket: open the run, weights lens, look.
- Maps expand to per-item rows, so "which chunk produced the bad summary" is answerable.

The review inbox's natural render is this same component parked at the gate.

## 7. L1 — permission-enforced collapse

Fold L1 into L2 as its **default collapsed state**: everything collapsed, only the two or three
most-swapped facets showing (mode, connection, review). One component, depth on demand.

**For non-admins the collapse is enforced, not merely default.** A non-admin sees a flat list of
the options they may change, grouped by step, with no topology: no node keys, no step counts, no
structure inferable from the DOM. What they may change is decided per slot
(12-CONFIGURATION §4).

## 8. Session chrome

Mode selector at the top of the session; feature chips under it. Both are override paths, so they
live inside the same write model, resolved through the same scope chain.
