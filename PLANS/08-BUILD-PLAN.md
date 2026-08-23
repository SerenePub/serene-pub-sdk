# 08 — Build Plan (Claude Code Execution)

**Status:** Re-derived 2026-08-17 from the consolidated set. The previous unit list predated
async blocks, map, events, halt, permissions, notifications, plugin lifecycle, the configuration
model, three framework adapters, the global switch and streaming semantics — it is superseded
entirely.

Operating model unchanged: Jody decomposes and reviews; Claude Code implements in PR-sized units;
the docs make each unit unambiguous and the invariants machine-checkable. Every Fixed Ledger law
that exists as a failing check is one an agent physically cannot drift from.

## 1. Standing rules (paste into CLAUDE.md)

```markdown
## Pipeline arc — standing rules
- The docs in /docs/pipeline (00–13) are normative. On any question they don't answer that
  touches constitutional surface (01 §14 Fixed Ledger, kinds, schema, contracts, permissions):
  STOP AND ASK. Never improvise API surface, schema, or manifest fields.
- Never weaken an invariant, delete/skip a test, or widen a type to make a test pass.
  If a test seems wrong, stop and say so.
- Rows are the source of record; never persist spec documents as blobs (F3).
- No durable run queue / outbox / checkpoint replay / gate timeouts. Runs are in-memory;
  waiting is free; budgets meter consumption only (F13, F23).
- No branching (F25). Parallelism is async blocks and maps; conditionals are halt-or-continue.
  Never add a loop node — a conditional loop needs an accumulator, which is a State kind.
- Transactions open and close only at storage-Consumer commit; never await inside (F12).
- Node keys are explicit; never generate from position (F21).
- Handlers are leaves: no peer binding calls, no orchestration inside bindings, no export calls
  from inside a run (F10).
- Extensions never author socket handlers. They declare; core registers and forwards (01 §9).
- Every SDK call is permission-checked at runtime against the hash-verified manifest AND the
  admin grant (F28). Never make a browser-side check the boundary.
- Never write a programmatic path that deletes core data or a user (F29). If a task seems to
  require one, stop and ask — it is a non-goal, not an omission.
- New columns: constitutional concepts only; must round-trip to the document (F4, F5).
- One unit per session; fresh context each unit; tests green before the next unit.
- The non-goals list (01 §16) is law: do not build items on it, even as "helpful extras."
- Plugin tooling and controls are HIDDEN in 0.6, not absent. Build them fully; surface them behind
  a dev flag only. contrib/ must traverse the real permission and consent path, never a bypass.
- Before shipping any unit ask: if this is wrong, is 0.7 a fix or a migration? Anything persisted,
  any id grammar, any addressing scheme, any published API is a migration — get it right now.
  See 07 §0g.
```

## 1a. The 0.6 shape, and the one question to ask per unit

Plugin tooling and controls are **hidden** in 0.6 (07 §0). Everything is built, core is fully
migrated, and the example repo works as a sanity check. **0.7 must be improvements, fixes and
capability — never a rewrite.**

That turns into a single question to ask of every unit, and it is the most useful review prompt in
this document:

> **If this is wrong, is 0.7 a fix or a migration?**

- *Fix* → ship it, iterate later. UI, copy, install flow, error wording, which surface points exist.
- *Migration* → get it right now. Anything persisted, any id grammar, any addressing scheme, any
  published API. The register is 07 §0g.

Two traps specific to this shape:

- **Hidden does not mean unfrozen for core-populated schemas.** Receipts, spec documents, node keys
  and slot addressing are written by core's own pipelines from day one, so they are as frozen as if
  plugins shipped visible. What hiding actually buys is freedom on the *plugin-side* tables —
  spend it deliberately.
- **Publishing the SDK creates external freeze.** Use a preview tag and state that breaking changes
  are expected before 0.7, or early authors become the reason the API can't be fixed (07 §0g).

## 2. Sequencing principles

- Schema before executor before bindings before UI; each unit's tests become the next unit's
  fixtures.
- Permissions land **before** anything that calls the SDK from plugin code, so no code path is
  ever written unchecked and retrofitted.
- The reference chat-turn spec is ported **by hand with Jody** — all the hard judgment lives
  there; agents then replicate the in-repo pattern, their most reliable mode.
- **Line-by-line human review zones:** U3 transaction discipline and promise parking · U4 async
  block and map scheduling · U8 gate placement · U10 permission enforcement · U18 socket
  forwarding · anything touching PGlite's single connection.

## 3. Units — engine

| U | Deliverable | Acceptance |
|---|---|---|
| **U1** Schema | 02 §2 tables in Drizzle; kind CHECK; FKs; canonical export/import + hash | `import(export(rows))` identity golden; `export(import(doc))=canonical(doc)`; dangling edge impossible; 6th kind rejected |
| **U2** Registry + sync | type_registry from descriptors; boot sync; version-vs-hash conflict; `core:` rejection; contrib scan | sync idempotence; **version-same-hash-changed raises, never publishes or ignores**; changed spec → new version, overrides untouched |
| **U3** Executor core | in-memory run; linear scheduling; value edges; `ok/err/cancelled/halt`; recorded seed; consumption budgets; **timeouts (F36)**; per-kind injection; transaction-at-commit | Task receives no services (purity probe); **halt is not err** and records node + reason; seeded replay identical; budget trips on consumption not waiting; **a parked gate never times out while a spinning hook does**; streaming uses idle not wall; admin ceiling cannot be exceeded by config; timeout yields routable `err(timeout)` with elapsed + limit recorded; txn never spans an await |
| **U4** Async blocks + map | block scheduling; force-sequential per block and instance-wide; map with declared max; no write-Consumers inside | **forced-sequential result identical to parallel** over the fixture corpus (F26); map budget applies across iterations; over-max rejected at publish |
| **U5** Bindings | bindQuery/Task/ConsumerTarget/Provider; error normalization; connection resolution and injection; connections unified by kind incl. singleton | conformance green per kind; adapter credential never readable by handler; **extension adapter cannot obtain core connection data** (F18); embeddings singleton enforced |
| **U6** Receipts | versioned schema; `receipt_nodes` timings; trigger attribution; Provider verbatim; seed; halt; lineage | `replay(receipt)` bit-identical without re-inference; per-node timings queryable; trigger source recorded for input/event/hook/ui/schedule |
| **U7** Streaming | stream-capable edges; static compatibility at publish; declared `earlyExit`; abandonment → `err`; tee on fan-out; buffer-no-backpressure | **recorded stream replayed as one value produces identical results** (F16); undeclared early return raises `err(stream-abandoned)`; cancelled stream still bills |
| **U8** Review gate | executor-substrate check **keyed on declared effects, not kind**; off/async/sync; promise parking; socket review card; schema-generated form incl. titles/descriptions/control hints | binding provably not invoked pre-approval; **an effectful Provider gates exactly like a Consumer**; edited payload indistinguishable to binding; author default-on works, forbid inexpressible; **existing summarization and graph-build review render identically to today from schema alone** |
| **U9** Events | registry; emission from Consumers; subscriptions; snapshots; static cycle CTE; runtime depth/descendant caps | subscriber independence (dispatch order ≠ completion order); cycle rejected without depth bound; caps trip budget-shaped; halt-heavy subscribers do not register as errors |
| **U10** Permissions | manifest verification; install grants; **runtime double-check**; required vs optional; resolved-once permission set | denied call returns routable `err(denied)` and is recorded; new permission on update not inherited; removed permission deleted; no DB read per call |
| **U11** Harness | run/replay/golden/diffReceipts; registry-row mocking; explicit seed; equivalence assertions | harness runs U25a goldens; mock swap touches nothing but the row |
| **U12** Builder + contracts | kind-named chain: `on/input/query/task/provider/consume` + `async/map/include`; `$ref`, `slot`; validate; canonical; `/contracts` codegen | **laws are type errors, not validator findings** (04 §4a): only `.input()` offered first and never again · second write-class `.consume()` won't compile · `.query()` rejects a Provider constructor · no branch method exists. Plus: explicit keys enforced; deprecated pin = tsc strikethrough |
| **U13** Sidecar | `jsonrpc-stdio@1` incl. stream chunks; lifecycle; functional Consumers | Python echo-Task fixture passes conformance; **DB physically unreachable**; sidecar Provider streams |

## 4. Units — plugins, UI, SDK

| U | Deliverable | Acceptance |
|---|---|---|
| **U14** Plugin lifecycle | registry; directories; enable/disable/stop/restart; diagnosed broken states; uninstall choices; atomic activation + conflict enumeration; **declared host-requirement check and checksummed dependency fetch** | missing files vs runtime error distinguished; partial activation impossible; **uninstall never touches core tables**; decoupling is registry refusal, not hot-unload; **checksum mismatch on fetch disables the plugin with a diagnosed reason**; unmet host requirement refused at install |
| **U15** Global switch | off by default; six server-side gates; session fallback to core default; cancel in-flight; no cron backfill; **0.6 exposure hidden behind a dev flag** (07 §0a) | with plugins off, every entry point refuses; **a chat bound to a plugin spec can still send messages**; the setting is absent from normal settings in 0.6, not merely defaulted off |
| **U16** Configuration model | slots; five-layer chain; presets and selections; per-slot write matrix; type-swap override | **admin connection change reaches a user with custom prompts**; user cannot write a connection slot; orphaned slots land in diagnostics |
| **U17** Surfaces runtime | registry; framework-neutral ABI; **three first-party adapters**; ctx incl. `ctx.state` and theme id; lazy + match-gated loading; error reporting | vanilla and React surfaces mount and pass conformance; two plugins with different bundled Svelte versions coexist; **match evaluated before fetch**; p95 mount under threshold; adapter errors reported through ctx |
| **U18** Socket forwarding + progress | declared handlers registered by core; permission check; payload validation; per-plugin rate and subscription limits; `ctx.progress`/`ctx.log` channel incl. sidecar notifications | plugin cannot register a raw handler; unpermitted call denied server-side; **progress never reaches a receipt** (F34); progress attributed to the task so no node key leaks to a non-admin; cancel surfaced alongside progress |
| **U19a** Task view (default) | active pipelines as configurable tasks, incl. registered chat types; permitted slots only; simplified run inspector; advanced tooling behind a system setting, off by default | **no topology inferable from the DOM**; a plugin-shipped chat mode appears as a task with no extra UI work; writes land at the correct scope from list vs in-chat |
| **U19b** Lens view + run inspector (advanced) | linear spine; facets; overrides-only writes; timeline scrubber; trigger attribution; per-node data | L2 cannot produce a row outside `node_overrides`; receipt hydration renders actual retrievals; map expands per item; hidden entirely until enabled |
| **U19d** Context infill | retrieval nodes per 16 §1; `strategy` field defaulting to `auto` with outcome recorded; embeddings as singleton connection with `embedding_model_ref` on vectors; Assemble holding budget, weights and minimums; template variable awareness from typed ports | **`auto` reproduces today's behaviour exactly**; receipt names the strategy that ran; a Query cannot reach an embedding service (purity probe); switching embedding model leaves stale vectors detectable, not silently wrong; unknown top-level template variable lands in diagnostics; **"why was this dropped" answerable from Assemble's receipt entry alone** |
| **U19c** MCP | `mcp` connection kind; stdio; tool + resource Providers; snapshot into type_registry; drift diagnostics; admin gating classification; verbatim receipts; sampling refused | **annotations never decide gating** (F31); drift produces a diagnostic not a silent failure; `replay(receipt)` re-runs without calling the tool; sampling request denied by default |
| **U20** Chat modes | declaration validation vs signature; picker; session binding; composer family binding; feature attachments | false family claim rejected; mid-session switch; attached feature runs with own budget |
| **U21** Consent + notifications | consent registry; default-deny; per-item and accept-all; read-only non-refusable; **admin self-consent; UI hidden when accounts disabled**; three notification audiences; rate limiting; link targets | **nothing affecting a *another* user runs before their consent**; admin's own action needs no second click; **with accounts disabled the consent record is still written**, so enabling accounts later needs no migration; read permission cannot be revoked; admin-audit disclosure present |
| **U22** Export / import | user personas, chats, prompt configs — individually and bundled; admin pipeline and preset export minus connections | round-trip import identity; **no credential appears in any export**; type/slot mismatch rejected on import |
| **U23** Localization scaffolding | locale maps with `en` fallback across descriptors and manifest; `ctx.locale`; `/i18n` helpers | bare string accepted as `{en}`; missing locale falls back without throwing |
| **U24** SDK preview cut | npm packaging (three scopes, four access levels); generation-enforced namespacing; contrib lint; versioned schemas | **another plugin's private namespace is untyped, not merely denied**; outside-dev smoke test = 07 §5 |
| **U24b** Compiler | static extraction over a JS/TS tree — hooks and parameters, components, entry points; pipeline documents; permission list; per-platform artifact assembly | **runs without executing author code**; a dynamically-constructed registration is a lint error, never a silent omission; manifest matches a hand-read of the source; unsupported platform refused at install, not at first call |

## 5. Migration (U25)

1. **U25a (by hand, paired):** chat turn as `core:spec/chat-turn@1`, behind a flag beside the old
   path. Golden receipts on a fixture corpus; parity = old/new equivalence + receipt review.
2. **U25b–d (agent, reference in-repo):** extraction → summarization → vectorization. Extraction
   exercises events and async review; **summarization exercises map**; vectorization exercises
   Query/Provider shapes.
3. **Deletion rule:** an old path is deleted only after its goldens match for the full corpus and
   the flag has defaulted on for one RC.
4. `private.core` ledger entries opened for every internal call the ports make, each with a
   promotion criterion (01 §12).

### 5a. Two clocks, not one — code paths and tables retire separately

*Ruled 2026-08-18.* The deletion rule above governs an old **code path**. Old **tables** run on a
longer clock: they survive to 0.7 or 0.8, so a user who upgrades and dislikes the result can be
rolled back, and so anything the migration got wrong is still recoverable rather than gone.

**"Retained" means frozen, not live.** On migration the old tables go **read-only immediately**;
the new rows are the sole source of truth from that moment. Dual-writing during a retention window
sounds cautious and is the worst option available — it produces two sources of truth that drift,
and by 0.8 nobody can say which one is right or whether dropping is safe. Retention is for
**rollback and forensics**, not continued operation.

That also makes rollback well-defined: a 0.7 → 0.6 downgrade works precisely because nothing new
was written to the old tables in between.

**Dropping is triggered by evidence, not by a version number.** Goldens green across the full
corpus for one complete release, and the `spec_diagnostics` unmapped-class rows resolved or
consciously accepted. If the criterion is only "it's 0.8 now," the drop lands on whatever state
happens to exist.

### 5b. Migrating user configuration is the part that loses people's work

Converting the engine is a correctness problem with a test. Converting **users' prompt configs** is
a data problem, and its failure mode is quiet: a migration that runs cleanly and changes what the
model receives produces "the bot feels different since the update" three weeks later, which is
unfalsifiable and unfixable.

Four rules, all of which reuse machinery that already exists:

**1. Parity is byte-identical output, measured on the preview.** For every fixture in the corpus,
the legacy engine's prompt and the migrated pipeline's **preview payload** must match exactly. A
preview stops at the pre-call substrate and reports the payload that would actually be sent (16 §7),
from the same formatter and tokenizer as a real run — so this compares the real thing rather than a
second renderer written for the migration, which would drift from both. Implemented in
`sdk-draft/src/migration.ts`; use case 73 pins it.

**2. Every migrated row gets a slug derived from its source row**, not a generated one — so
re-running the migration after a bug fix *matches and replaces* rather than creating a second copy
beside the first (12 §3b). A migration that cannot be safely re-run is one nobody dares fix.

**3. Nothing is dropped silently.** Anything that does not map — a legacy field with no slot on the
new spec — lands in `spec_diagnostics` with a reason and stays visible and exportable, exactly as an
orphaned slot does after a node swap (12 §5). The harness *refuses* a report containing a
non-migrated row with no reason: that is a bug in the migration, not in the data.

**4. Record the scope each value landed at.** The commonest way to lose a customisation is not to
drop it but to migrate it to the wrong layer — a user's prompt written at instance scope now applies
to everyone; written at chat scope it applies to one chat and vanishes everywhere else. The report
records `scopeKind` per entry so the mapping is reviewable rather than assumed (12 §2).

**The gate is deliberately strict about an empty corpus.** "No failures" and "nothing was checked"
look identical in a summary, and only one of them is safe to ship, so `parityGate` fails below a
declared minimum fixture count rather than passing vacuously.

## 6. The example plugin is the acceptance test (U26)

Not a demo — it *is* 07 §5's gate. Three chat-message components (Svelte, React, vanilla) plus the
dice extension: custom Task and Consumer, a full spec, a Provider call, `match`-bound renderer,
composer action, message action, namespaced extension data, component settings. Recommended
additions: **review defaulted on** for the dice Consumer, and **multiple dice through a map**.

Prerequisites it forces: `composer-action@1` in the 0.6 point set · a UI-initiated-run path
(13 §7) · the run seed (F11), because a dice roll is neither pure nor external.

Ships from `contrib/` in 0.6 and becomes a packaged release at 0.7 — which also demonstrates the
lift-out path the docs promise and nothing else proves.

**⚠ It must traverse the real path, not a dev bypass** (07 §0b). Since plugin support is hidden in
0.6 and nothing in core installs a plugin, `contrib/` is the *only* thing exercising manifest
verification, generated permissions, admin grants, the runtime double-check, the consent registry
and the global switch. If `contrib/` skips them "because it's in-tree," all of that ships in 0.6
having never run, and 0.7 discovers it. Same manifest, same grants, same consent records —
different source directory, nothing else.

## 7. Failure modes to police in review

- Shortcut under test pressure: weakening an invariant or widening a type to green a test.
- Invention on ambiguity instead of stopping.
- **Rebuilt ghosts of deleted designs** — the non-goals list exists because agents fill silence.
  Watch specifically for: outbox tables · gate timeouts · universal model APIs · **branching or a
  loop node** · **a bulk user/content delete endpoint** · adapter-internal failover ·
  plugin-authored socket handlers · client-side permission checks · hot-unload of plugin modules.
- Long-session drift: enforce fresh-context-per-unit mechanically.
- **Silently conflating `halt` with `err`.** They read alike in code and mean opposite things to
  every dashboard, diagnostic and support conversation downstream.

## 7a. Quality-bar units (15-QUALITY-BAR)

Small, high-leverage, and easy to defer into never. They are the difference between the C+ and the
A on a plugin author's first hour, and between "powerful" and "loved" on the user side.

| U | Deliverable | Acceptance |
|---|---|---|
| **U27** Scaffold | `npm create serene-plugin` → built, installed, enabled, rendering; ships a hook, a component, a golden, a conformance run, CI | **timed in CI, under 60s on a clean machine**; the author's first conformance result is a green check they didn't opt into |
| **U28** Dev host | generational plugin registry; rebuild and re-resolve without restarting SP | edit a hook, save, trigger, see new behaviour; **open chat survives** |
| **U29** Teaching errors | every authoring-time prohibition names what to do instead, with a doc link | **100% coverage test** over Fixed Ledger laws violable in authoring |
| **U30** Prompt preview | dry-run to the Provider call; show assembled text with per-node attribution | available on every Provider node; attribution matches the receipt for the same input |
| **U31** Why-this-message | affordance on any message opening the run at the producing node; diff two runs; regenerate with seed or one override changed | **≤ 2 clicks**; regenerate-with-change replays from receipt rather than re-running upstream |
| **U32** Install confidence | capabilities **and** cannot-do list; install-disabled default; first-run behaviour summary | cannot-do list is generated from laws, not authored copy; summary delivered within 24h of first activity |
| **U33** Generated reference docs | core type pages emitted from descriptors; core goldens published | **zero hand-written type pages**; a descriptor change updates docs in the same commit |

## 8. 0.7 units (sketch — decompose when 0.6 is cut)

pack / pack --init with permission generation over vendored libraries · repository and release
model with tag and checksum verification · install and audit UX · update flow with permission diff
and migrations · dependency and library resolution · uv provisioning · storage API promotion ·
sidebar-panel surface · **native component tier** · first `private.core` promotions.
