# 07 — Release Plan: 0.6.0 / 0.7.0

**Status:** Consolidated 2026-08-17. Principle: 0.6 is the pipeline arc + SDK **preview**; 0.7 is
plugins as **downloadable/runtime assets**. The manifest is the seam — 0.6 defines and consumes it
from the dev directory; 0.7 builds packaging and delivery around it unchanged. The incubation
ledger, now addressable as `private.core`, is what makes a narrow 0.6 SDK shippable without
freezing half-baked contracts under release pressure.

## 0. Two channels, shipped together

**Decided 2026-08-17.** `0.6.0-beta` and `0.7.0-pre1` ship **at the same time**, as two channels off
one codebase:

| | Audience | Plugins |
|---|---|---|
| **0.6.0-beta** | everyone | hidden |
| **0.7.0-pre1** | SDK authors, testers | exposed |

**The property that makes this safe: same schema, same code, one flag.** If the two builds ever
diverge beyond exposure, dual-channel becomes a migration problem instead of a toggle. Keep the
difference to a flag and moving between channels stays free.

**⚠ This shrinks the soft-freeze dividend, and that is fine if stated.** §0g notes that plugin-side
tables stay revisable "as long as SP ships no enabled plugin" — but pre1 users *will* install
things, create consent rows and write plugin data. So either those tables freeze early, or
**pre-release users are told plainly that plugin-side data may require migration or reset before
0.7.0 final.** Say it at the top of the pre1 notes; it is normal for a pre-release and it preserves
the freedom the window exists to give.

The self-selection is the win: anyone who installs pre1 is exactly the person whose feedback is
wanted, and they have opted into instability by choosing that channel.

### 0-i. Why it works this way

Plugin support is *built* in 0.6.0 and *not surfaced* on the beta channel, buying time to refine
the SDK documentation and example repository against real feedback before anything freezes.

The global plugin switch (09 §8) already exists and is already off by default, so this costs almost
nothing to implement — the mechanism was designed for exactly this shape.

### 0a. What "hidden" means on the beta channel

Ambiguity here becomes an implementation guess. The plugin sidebar and its system setting are
**absent** from the beta build's settings, not shipped visible-but-off — a toggle that exists is a
feature users find, enable, and file issues against. On the pre1 channel the same code is
surfaced normally.

### 0b. ⚠ `contrib/` must go through the real permission and consent path

The engine half of 0.6 is proven by core migrating onto it — that is the dogfood invariant working
as designed. **The plugin half has no core consumer.** Nothing in core installs a plugin, grants a
permission, or records a consent, so manifest verification, install-time grants, the runtime
double-check, the consent registry and the global switch would all ship in 0.6 exercised by
nothing.

Fix: `contrib/` plugins go through the **identical** path — same manifest, same generated
permission list, same admin grants, same consent records — sourced from disk instead of a
repository. Then 0.6 proves the machinery rather than merely containing it, and 0.7 changes only
where the artifact came from.

Without this, "we built it in 0.6" means the code exists and nothing more.

### 0c. What 0.6 can still lead with

Plugins staying dark does not make 0.6 a quiet release. Shipped and exposed: pipelines with core
migrated onto them, the task view, the run inspector with the timeline scrubber, the assembled-
prompt preview, the configuration model, and **MCP** — which is connections and core Provider
types, not plugins, and therefore ships fully exposed.

MCP is worth naming as the 0.6 headline for that reason: a differentiated capability that is not
gated on the plugin ecosystem being ready.

### 0d. Publish the SDK alongside pre1

Shipping the channels together removes the awkward version of this: authors get a real host to test
in on day one rather than an npm package with nowhere to run.

Publish `@serene-pub/sdk` on a `preview`/`next` tag with an explicit stated policy that **breaking
changes are expected before 0.7.0 final** — see §0g, because publishing is what creates the
external freeze, and a preview treated as stable is a 1.0 nobody agreed to.

The gate that still matters: **0.7.0 final should not open to an empty shelf.** Treat "N
third-party plugins working" as a condition of final, seeded by the pre1 window.

### 0e. Name the feedback channel, or the time passes unused

"Time for refinement and feedback" is the classic thing that quietly doesn't happen. Feedback needs
a named destination and named people — an early-access group, a discussion category, whatever
form — decided at the start of the window rather than looked for at the end of it.

### 0g. The no-rewrite register — what must be right in 0.6

The stated intent is that **0.7 brings improvements, fixes and capability, never a rewrite.** That
is achievable, but only if the things that are expensive-or-impossible to change later are settled
now. Everything else can and should stay soft.

**Cheap to change in 0.7 — do not over-invest:** UI layout and copy · install flow and screens ·
error wording · docs structure · which surface points exist (open registry, additive) · new node
types, shapes and events (open registries).

**Hard-frozen in 0.6 — core populates these whether plugins are visible or not:**

| | Why it can't move later |
|---|---|
| Receipt schema (incl. `receipt_nodes`, seed, trigger attribution) | every 0.6 run writes one; `replay()` must keep working |
| Spec document schema and canonical hashing | every core spec is stored as rows and exported as a document |
| `node_key` semantics (F21) | keys anchor overrides, receipts, lenses and `ctx.state`; a change orphans every user's tuning |
| Slot addressing and the five-layer scope chain | retrofitting a layer means migrating a table everything depends on — the migration this schema exists to avoid |
| Type id grammar (`core:provider/x@1`) | every spec's pins reference it |
| Core event ids and payload shapes | subscriptions and receipts persist against them |
| Connection kinds (= produced shape) | connections and MCP snapshots key on them |

**Soft-frozen — only populated if someone opts in, which the hidden rollout makes rare:** plugin
tables · permission key names · consent rows · manifest field set · on-disk directory layout.
**This is the real dividend of hiding plugins in 0.6** — as long as SP ships no enabled plugin,
these stay genuinely revisable. Worth spending that freedom deliberately rather than assuming it
isn't there.

**Externally frozen the moment the SDK is published (§0d):** the surface ABI (`mount`/`update`/
`destroy`, `ctx` shape) · the access-path grammar `sdk.<scope>.<visibility>.<owner>.<version>.<ns>`
· `jsonrpc-stdio@1` · the socket handler naming `plugin:<id>:<descriptor>` · the compiler's
definition of a valid static registration.

> **⚠ This category is created by publishing, and it is in tension with the freedom the hidden
> rollout buys.** Early authors building against a preview become the reason not to fix the API.
> Publish on a `preview`/`next` npm tag with an explicit, stated policy that breaking changes are
> expected before 0.7 — and actually take them when they're warranted. A preview that is treated
> as stable is just a 1.0 nobody agreed to.

**Two structural items that must exist in 0.6 even though nothing uses them yet**, because
retrofitting changes every plugin's URLs or invalidates every published artifact:

- the dispatch route shape for future page surfaces (10 §9)
- reserved provenance fields in the manifest (13 §7e)

### 0h. "Presentable" cuts both ways

0.6 is judged by two audiences on different halves of 15-QUALITY-BAR.

- **Users see** the task view, the run inspector, the assembled-prompt preview, why-did-it-say-that,
  MCP. This half must be finished, not merely working.
- **SDK testers see** the scaffold, the dev loop, teaching errors, and the receipt-printing command.
  These are the *feedback instrument* for the 0.6 window — if they're rough, the feedback that
  arrives is about them rather than about the SDK design, and the window is wasted.

### 0f. Honest note on scope

This de-risks **API freeze and support load**. It does not reduce **effort** — everything is still
built for 0.6. If 0.6's size is itself the concern (and the competitive assessment argues it is),
that wants a separate seam: engine, permissions and migration first; components, consent and the
inspector second.

## 1. Ships in 0.6.0

**Engine**

- Schema + boot-time spec sync (02) — rows as record, publish/freeze, canonical hash,
  version-vs-hash conflict detection, replace-as-pointer-move, retire-not-delete.
- Executor: in-memory runs, value edges, streaming edge, discriminated results **including
  `halt`**, per-run recorded seed, consumption-metered budgets, injection-scoped services,
  transactions-at-commit-only.
- **Linear specs only** (F25). **Async blocks** and **map** with `sequential | parallel`, admin
  force-sequential per block and instance-wide, and the equivalence property under test.
- Bindings, in-process (`runtime: node`), all five kinds incl. `bindProvider`.
- Core adapters re-registered as `core:provider/*@1` with connection injection; connections
  unified by kind with singleton support for embeddings.
- **Events**: registry, emission from Consumers, subscriptions, lineage in receipts, cycle guards
  (static CTE + runtime depth/descendant caps).
- Review gate: executor substrate, three positions; schema-generated review form.
- Receipts (versioned schema) + `receipt_nodes` timings + trigger attribution + replay + golden
  harness + diffReceipts.
- Sidecar **protocol specified** (`jsonrpc-stdio@1`, including stream chunks) + minimal host:
  dev-mode manual `command` only.

**Plugins**

- Plugin registry, directories, enable/disable/stop/restart, diagnosed broken states.
- **Global plugin switch, off by default** (09 §8).
- Permission model: manifest-declared, admin-granted, runtime double-check (F28).
- Lifecycle hooks incl. scheduled, with per-hook budgets and overlap policy. Exports, brokered.
- `plugin_data` KV and settings storage.

**Consent and notifications**

- Notifications: user / per-admin / admin-global, durable, link targets, rate limiting.
- User consent: default-deny for anything affecting an account, per-item or accept-all, read-only
  access non-refusable, admin-audit disclosure (11). **Admin self-consent on their own actions,
  and the opt-in UI hidden entirely when accounts are disabled** — the solo install pays no
  multi-user tax (11 §4a).

**MCP** (14)

- `mcp` connection kind, stdio transport, `mcp-tool@1` and `mcp-resource@1` Providers.
- Tool/resource snapshot into `type_registry`, drift as diagnostics.
- Admin gating classification, annotation-prefilled but never annotation-decided (F31).
- Verbatim receipts per call; sampling off by default.

**UI**

- **Task view as the default front door** (05 §0a): active pipelines — including every registered
  chat type — as configurable tasks, no topology, simplified run inspector available.
- **Pipeline customization and advanced tooling off by default**, enabled at the system-setting
  level.
- L2 lens view (05, advanced): linear spine, facets from descriptors, overrides-only writes, run
  inspector with timeline scrubber on the same spine, review card in-spine, event chips.
- Chat modes (06): declarations, picker, session spec binding, family-driven composer, feature
  attachments.
- Configuration model (12): prompts / template / connection / settings slots, five-layer scope
  chain, admin presets.
- **Components, `virtual` tier only** (10): surfaces runtime, framework-neutral ABI, three
  first-party adapters (Svelte, React, vanilla), `ctx` incl. `ctx.state` and theme id,
  safelisted Skeleton class surface, conformance kit.
- Public surface points: `chat-message@1`, `message-actions@1`, `composer-action@1`,
  `settings-section@1`. `facet-block` and `review` incubate core-internal.
- Export/import: user personas, chats, prompt configs, individually or bundled (12 §7).
- Localization scaffolding: English-only with `i18n` fallback structure throughout (04 §7).

**Migration (the arc's proof)**

- Chat turn ported by hand as the reference spec; runs behind a flag; parity via goldens.
- Extraction, summarization (exercises **map**), vectorization ported against the reference; old
  paths deleted after goldens match.

**SDK preview (npm)**

- `/spec` builder incl. `.asyncBlock()` / `.map()`, `/types` descriptors, `/contracts`
  (experimental), `/i18n`, `/server` bindings incl. hooks and exports, `/testing` harness +
  conformance kits, `/client` adapters + rpc/events/state.
- Four access levels with generation-enforced namespacing.
- `contrib/` dev flow; versioned spec-document + receipt schemas.

**Example plugin** (13 §9) — three chat-message components, one per framework, plus the dice
extension. It *is* the gate criterion below, not a demo.

## 2. Ships in 0.7.0

- **Packed artifact format** + `pack` / `pack --init` with manifest scaffolding and permission
  generation (incl. walking vendored libraries).
- **Distribution**: repository-driven release model, official list plus custom repos, tagged
  releases only, tag-must-equal-manifest-version, manifest read from the tagged commit,
  per-artifact checksums, pre-release toggle.
- **Updates**: version resolution against `engines`, permission-diff-on-update with no inherited
  grants, type and settings migration execution, overrides preserved.
- **Dependency resolution** for `dependencies` (runtime) and `libraries` (build-time).
- **Sidecar packaging**, not provisioning. F33 removes the need for host-managed environments: a
  plugin bundles its own runtime dependencies per platform (vendored wheels, zipapp, or compiled
  binary), so `uv`-managed per-plugin venvs are no longer required. What remains is verifying
  declared host requirements at install and refusing cleanly when unmet. `command` stays as the
  escape hatch.
- **Storage API**: `plugin_data` promoted to public contract; extraJson lane formalized.
- **Surfaces tier 2**: `sidebar-panel@1` (+ sidebar replacement if the panel contract proves out).
  `facet-block` / `review` promoted from incubation if stable.
- **MCP**: HTTP/SSE transports, sampling opt-in with its own budget, MCP prompts wired into
  prompt/template slots, elicitation via Human-as-Provider, server discovery beside the plugin
  repository model (14 §9).
- **Native component tier** (10 §2), Svelte-only, with a declared Svelte ABI pin.
- First **`private.core` promotions**, with usage evidence.

## 3. Explicitly not answered until 0.7

- Artifact format details, signing, install/update UX polish, marketplace surface.
- Public storage API shape beyond the reserved lanes.
- Container/remote transports (the routing column reserves the door; nothing more).
- Accessibility beyond generated UI (10 §8).

## 4. Deferred beyond 0.7 (banked, not planned)

- `layout.root` (tier 3) — only after core's default layout renders through the registry.
- Scoped page replacement — though **the dispatch route must exist in the skeleton from 0.6**
  (10 §9), because retrofitting it changes every plugin's URLs.
- Facet profiles. Remote client API for driving SP.
- Additional locales (the fallback structure ships in 0.6; the translations don't).

## 5. Gate criteria

**0.6.0 ships when:**

- All four core features run as specs with green parity goldens and old paths deleted.
- The example plugin (13 §9), written against docs alone, registers a type, ships a spec, renders
  a chat-message surface in all three frameworks, adds a composer action and a message action,
  and passes conformance — **met in dev mode via `contrib/`, since plugin support is not surfaced
  in 0.6 (§0)**. It must traverse the real permission and consent path (§0b), not a bypass.
- **`@serene-pub/sdk` is published to npm** as a preview, so external authors can build during the
  quiet window (§0d).
- Equivalence tests green: forced-sequential async blocks and maps; recorded-stream-as-value.
- With plugins disabled, the frontend bundle is within its declared ceiling — the state most
  installations are in (10 §10).
- **The quality bar in 15 §4 is met**, in particular: scaffold-to-visible-render under 60s timed in
  CI · edit-to-effect with no SP restart · every prohibition error names an alternative ·
  assembled-prompt preview on every Provider node · "why did it say that" within two clicks · the
  install screen prints the cannot-do list. These are the difference between a design that reviews
  well and one people stay with.

**0.7.0 pre-release ships when:** plugin support is surfaced; the example plugin lifts out to its
own repo, packs, and installs through the UI with capabilities and the cannot-do list displayed;
and **at least N third-party plugins built during the 0.6 window install and pass conformance**
(§0d) — an install UI with nothing in it is a failure mode, not a soft launch.

**0.7.0 ships when:** in addition, an installed plugin survives an SP upgrade that migrates one of
its pinned types, and **at least one symbol has been promoted out of `private.core`** with usage
evidence — the only standing check against the public data API starving while core works
comfortably behind the private one.
