# Serene Pub Pipeline & Plugin System — Design Set

**Consolidated 2026-08-17.** Folds the 0.6/0.7 design arc — the original constitution and SDK
drafts (2026-08-14), the extension-system conversation (2026-08-15), and the review pass of
2026-08-17 — into one coherent set. The interim amendment document (09-AMENDMENTS-A) is retired;
its ratified content lives in these docs and its unresolved items are in **13-OPEN-RULINGS**.

## Map

| Doc | Contents | Consumed by |
|---|---|---|
| **01-CONSTITUTION** | Laws, five kinds, linear pipelines, execution model, halt, events, review gate, streaming, SDK access levels, Fixed Ledger (F1–F30), non-goals | Everything; review anchor |
| **02-SPEC-STORAGE** | Rows as record, schema, versioning, import matrix, sync, overrides, migrations, diagnostics queries | U1, U2, U16 |
| **03-EXTENSION-SYSTEM** | What an extension is: manifest, runtimes, transports, communication, hooks and exports, `match`, storage lanes, conformance | U5, U13, U14 |
| **04-SDK** | Three scopes × four access levels, descriptor/binding split, builder, harness, contrib flow, localization | U11, U12, U24 |
| **05-L2-LENS-VIEW** | Linear spine, facets, overrides-only writes, run inspector with timeline scrubber, permission-enforced collapse | U19 |
| **06-CHAT-MODES** | Lifecycle signatures, families, features-as-attachments | U20 |
| **07-RELEASE-PLAN** | 0.6.0 scope, 0.7.0 scope, explicit non-answers, gate criteria | Release review |
| **08-BUILD-PLAN** | CLAUDE.md standing rules, units U1–U26 with acceptance criteria, migration, failure modes | Claude Code sessions |
| **09-PLUGIN-LIFECYCLE** | Release standard, manifest, permissions, activation and conflicts, directories, uninstall, global switch, admin surface | U10, U14, U15 |
| **10-COMPONENTS** | Surfaces, render tiers, `ctx` and `ctx.state`, Skeleton styling, framework neutrality, frontend cost | U17, U18 |
| **11-EVENTS-AND-CONSENT** | Event registry, dispatch, user consent model, notifications | U9, U21 |
| **12-CONFIGURATION** | Slots and the scope chain, presets, node swapping, plugin settings, export/import, localization | U16, U22, U23 |
| **13-OPEN-RULINGS** | What still needs deciding, ordered by blocking-ness, plus the example plugin | Jody |
| **14-MCP** | MCP servers as connections, mapping to kinds, snapshot vs dynamic tools, gating, sampling, injection surface | U19c |
| **15-QUALITY-BAR** | What turns the design from sound into loved — first-hour experience for authors and users, install-time confidence, with measurable targets | 07 §5 gate |
| **16-CONTEXT-INFILL** | Provider/Query line, RAG-vs-keyword as declared strategy, fragments, template variable awareness, where weights and minimums live | U25, U12 |
| **17-PIPELINE-EXAMPLES** | Worked code — descriptors across three modalities, the context fragment, the chat turn, TTS and image-gen specs, and what the user sees | authoring docs |
| *ASSESSMENT-competitive-position* | Non-normative read against SillyTavern, Open WebUI, LibreChat, ComfyUI | — |

## Shipping shape

**Everything is built in 0.6.0; plugin tooling and controls are hidden until the 0.7.0
pre-release** (07 §0). Core migrates fully onto pipelines, the example repo works as a sanity
check, and the window buys refinement on the SDK docs before anything freezes. **0.7 must be
improvements, fixes and capability — never a rewrite**, which makes 07 §0g's no-rewrite register
the section to read before building anything persisted.

Three things to hold onto: `contrib/` must traverse the real permission and consent path or that
machinery ships untested (07 §0b) · the SDK on npm during the window means 0.7 doesn't open to an
empty shelf, at the cost of an external freeze that needs an explicit breaking-changes policy
(07 §0d, §0g) · **MCP is not a plugin feature and ships fully exposed in 0.6**, which gives the
release a headline that isn't gated on the ecosystem.

## What changed in this consolidation

- **The front door is the pipeline view, not the pipeline editor.** Pipeline customization and
  advanced tooling are hidden by default and enabled at the system-setting level. Everyone starts
  with an adapted prompt-configs sidebar: active pipelines as configurable tasks — **including
  every registered chat type** — with no topology visible. The simplified run inspector stays
  available, because "see why your bot did that" is the most valuable thing here for a normal user.
- **The solo install pays no multi-user tax.** An admin's own action implies their own consent, and
  the consent UI is hidden entirely when accounts are disabled — while the record is still written,
  so enabling accounts later needs no migration.
- **MCP is supported as core connection kind plus Provider types** (14), never as a plugin
  category. Every tool call lands in a replayable receipt and passes the review gate before it
  acts, which no other MCP client does.
- **The review gate keys on declared effects, not on kind** — an effectful Provider gates exactly
  like a Consumer. Ratified 2026-08-18 (13 §7a); amends F14.

- **Agent → Provider.** Ratified; applied throughout including `bindProvider`, `core:provider/*`,
  `kind='provider'`.
- **No branching.** Pipelines are linear. Parallelism is **async blocks**; iteration is a **map**
  node; conditionals are **halt-or-continue**. There is no loop node — a conditional loop needs an
  accumulator, which is a State kind by the back door.
- **Effects → events.** One registry answers "what causes what." Admins attach pipelines to
  events; users consent per subscription.
- **One primary *write*, not one primary action.** A Consumer's row ids flow downstream and the
  chain continues past it. `.commit()` no longer seals.
- **Configuration is per slot, not per bundle.** Prompts / Template / Connection / Settings
  resolve independently through chat → user → preset → instance → author. Presets select; they
  never contain.
- **SDK access has four levels**, gated by call-site ownership. `private.core` is the incubation
  ledger, made enumerable.
- **Permissions are enforced at runtime** against the hash-verified manifest and the admin's
  grant — so "capabilities are declared, not enforced" is no longer the whole story.
- **User consent is default-deny** for anything affecting an account; read-only access is not
  refusable, which is what gives admins audit without giving them automated control.
- **Plugins are off by default**, globally, with a switch that returns SP to vanilla instantly.
- **Components ship `virtual` tier first** — framework-neutral, three first-party adapters.
  `native` (Svelte-only) is a later optimization, not a foundation.
- **Randomness comes from a per-run recorded seed**, which keeps Tasks pure and replay exact.
- **Streaming is closed**: static compatibility, declared early exit, buffer-don't-throttle, and
  chunk boundaries are transport rather than data.

## Needs Jody before build starts

All live rulings are in **13-OPEN-RULINGS**. The four that block units:

1. **Joined effects** under event unification (13 §1) — structural.
2. **Receipt retention** (13 §2) — halt-heavy event pipelines make this a per-message multiplier.
3. ~~**Review gate keyed on effects** (13 §7a)~~ — **ratified 2026-08-18.**
4. **Secret-typed plugin settings** (13 §6) — partly revisits the no-plugin-secrets ruling.

Cheap and worth closing before UI copy: **"task" vs the Task kind** (13 §7b).

## How to use with Claude Code

Drop this set at `/docs/pipeline`, paste 08 §1 into CLAUDE.md, and run units in order — one unit
per fresh session, tests green before advancing. Review zones and failure modes: 08 §2, §7.

**The non-goals list (01 §16) is the most load-bearing section for agent work.** It exists because
agents fill silence: branching, loop nodes, outbox tables, gate timeouts, bulk-delete endpoints
and client-side permission checks are all things a helpful agent will reconstruct unless told
plainly they were removed on purpose.
