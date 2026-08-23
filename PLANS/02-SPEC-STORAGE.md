# 02 — Spec Storage: Rows as the System of Record

**Status:** Consolidated 2026-08-17. Implements Constitution §6, §5, F3–F5, F20–F21.
**Stack notes:** Drizzle ORM over PGlite/Postgres. `jsonb().$type<T>()` binds generated
`/contracts` declarations to config columns.

## 1. Principle

Normalized rows are the source of record for installed specs. The document is a deterministic
export of those rows and the import format for packages. The editor writes rows; documents are
always derived. `import(export(rows))` is identity; `export(import(doc))` = `canonical(doc)`; a
content hash is stored per version. All three are golden tests.

## 2. Schema

Anything the constitution names is a column; anything a type defines stays in jsonb.

```
pipeline_specs           id, name, source_plugin_id?, active_version_id?, created_at
                         -- active_version_id: "replace" is a pointer move, never an overwrite (§3)

pipeline_spec_versions   id, spec_id FK, semver, engine_range, status(draft|published|retired),
                         canonical_hash, migrated_from?, derived_from_spec_version_id?,
                         mode jsonb?, created_at, published_at?
                         -- semver is authored in the Input node and promoted here (§3)
                         -- derived_from: clones remember their origin, for upstream diffs

pipeline_nodes           id, spec_version_id FK, node_key, kind CHECK(kind IN
                         ('input','query','task','provider','consumer')),
                         type_id, type_version, config jsonb,
                         block_id?, block_kind?(async|map), block_order?,
                         toggleable bool, enabled_default bool,
                         budget_* columns, position
                         UNIQUE(spec_version_id, node_key)

pipeline_edges           id, spec_version_id FK,
                         from_node FK, from_port, to_node FK, to_port,
                         edge_shape, streaming bool

event_registry           event_id PK, slug UNIQUE, version, family(data|action),
                         payload_shape jsonb, owner_plugin_id? NULL,
                         affects_user bool, description_i18n jsonb
                         -- core-defined only. Nodes cannot emit and plugins cannot define
                         -- events (01 §8); the cause of each event is declared on the core
                         -- consumer target, so no per-spec emit table exists.
                         -- slug: the PK-agnostic reference used to seed, sync and update rows
                         -- across instances and upgrades (13 §7g). Same convention applies to
                         -- every core-seeded registry — type_registry, surfaces, shapes — so
                         -- there is one identity convention rather than four.
                         -- family: DATA events describe a change and carry write-target
                         -- mappings, so they participate in the cycle CTE. ACTION events
                         -- (ui-action, schedule-tick) have no write targets and drop out of
                         -- it instead of needing an exception (13 §7).
                         -- owner_plugin_id: reserved, always NULL in 0.6. Reopening
                         -- plugin-defined events is then a permission, not a migration.

event_subscriptions      id, event_id, event_version, spec_id FK, preset_id?,
                         depth_bound?, enabled, created_by
                         -- feeds the inter-spec cycle CTE (F9)

type_registry            type_id, version, kind, owner_plugin_id, status(live|deprecated|removed),
                         transport(node|process), config_schema jsonb, ports jsonb, shapes jsonb,
                         facets jsonb, slots jsonb, declares_randomness bool, early_exit bool,
                         timeout_ms_default, timeout_kind(wall|idle), 
                         connection_kind?, usage_extractor?, i18n jsonb

node_overrides           spec_version_id, node_key, slot_key, path, value,
                         scope_kind(instance|preset|user|chat), scope_id
                         UNIQUE(spec_version_id, node_key, slot_key, path, scope_kind, scope_id)

sampling_configs         id, name, shape, values jsonb, owner_scope, owner_id, created_at
                         -- named reusable generation parameters, typed by shape and handed to
                         -- the connection adapter uninterpreted by core (12 §2, 17 §1a).
                         -- Nodes reference one; the scope chain may swap the reference or
                         -- override individual fields on top of it.

config_presets           id, spec_id FK, name, description, created_by, is_instance_default

config_selections        scope_kind(user|chat), scope_id, spec_id FK, preset_id FK

connections              id, name, kind, adapter_type_id, config jsonb,
                         credentials jsonb ENCRYPTED, enabled, created_at
                         -- kind = the shape the Provider produces (F17)

active_connection        kind PK, connection_id FK       -- singleton kinds only, e.g. embeddings

<vector store rows>      …, embedding_model_ref
                         -- which model produced this vector (16 §2a). Cheap now, impossible to
                         -- backfill; it is what makes an embedding-model switch incremental and
                         -- diagnosable instead of destructive.

plugins                  id, slug, version, type_flags, manifest jsonb, manifest_hash,
                         install_path, status(enabled|disabled|stopped|broken),
                         broken_reason?, settings jsonb, installed_at

plugin_permissions       plugin_id FK, permission_key, required bool, granted bool, granted_at

plugin_data              plugin_id FK, key, value jsonb        -- namespaced KV, extension-owned

user_consents            user_id, subject_kind(permission|event_subscription),
                         subject_ref, decision(pending|granted|revoked), accept_all bool,
                         decided_at

receipts                 id, spec_version_id FK, root_run_id, parent_run_id, depth,
                         trigger_source(input|event|hook|ui|schedule), trigger_ref,
                         actor_user_id?, seed, started_at, ended_at,
                         outcome(ok|err|cancelled|halt), halt_node_key?, halt_reason?,
                         schema_version, compact bool, body jsonb
                         -- compact: a run that halted before any effectful node stores
                         -- trigger, spec version, halt node/reason and elapsed — no payloads,
                         -- no receipt_nodes rows. Most subscribers to a hot event halt on
                         -- every message, and that is success (01 §5), so this is the row
                         -- that would otherwise dominate the table by count (13 §2).
                         -- Retention: last N runs or M bytes, whichever trips first; admin
                         -- setting, defaults N=1000 / M=512MB. Receipts are diagnostic, are
                         -- excluded from user export (12 §7), and cascade-delete with the user.

receipt_nodes            receipt_id FK, node_key, seq, started_at, ended_at,
                         input jsonb, output jsonb, result(ok|err|cancelled|halt),
                         attempts, cache_hit, block_mode(sequential|parallel)?,
                         elapsed_ms, timeout_ms_applied, timed_out bool,
                         sampling_applied jsonb?, sampling_ignored jsonb?
                         -- which sampler fields the adapter honoured and which it dropped;
                         -- "why does mirostat do nothing" is otherwise unanswerable (12 §2)

spec_diagnostics         spec_version_id, node_key?, severity, code, detail jsonb, found_at
```

Load-bearing choices:

- **`kind` is a CHECK constraint** — the closed taxonomy is enforced by the database (F1).
- **Edges FK to nodes** — a dangling edge is structurally impossible, not a lint finding.
- **`node_key` is explicit** and unique per version. Overrides, receipts, lenses and `ctx.state`
  all key on it; auto-generation from position would orphan every user's tuning on any node
  insertion (F21).
- **`receipt_nodes` is a table, not jsonb.** The run inspector's timeline scrubber (05 §6) needs
  per-node timings queryable, not buried in a blob.
- **`receipts.seed`** is what keeps randomness replayable while Tasks stay pure (01 §5).
- **`event_registry.affects_user`** is what makes consent enforceable without per-event
  hand-classification (11-EVENTS §4).
- **`type_registry` is materialized host knowledge.** As rows, every pin in every spec becomes
  joinable.

## 3. Versioning, publish, replace, retire

- The **draft head** is mutable rows the editor works against directly.
- **Publish freezes:** write-lock the version's rows, compute and store `canonical_hash`.
- **Version is authored in the Input node** and promoted to `semver` on import. The document is
  authoritative; the column is the materialization — never two sources that can drift.
- **Declared version wins over content hash.** Boot sync and import compare both:

  | State | Behavior |
  |---|---|
  | version bumped, hash changed | new version published (the normal path) |
  | version same, hash same | no-op |
  | **version same, hash changed** | **error: "spec content changed without a version bump"** |
  | version older than installed | blocked |

  Never a silent publish, never a silent ignore. The draft head is exempt, so the Vite-restart dev
  loop is unaffected.
- **Replace is a pointer move.** Importing a newer version adds a version row and moves
  `active_version_id`. Prior versions persist for replay, goldens and historical receipts — the
  blob model's failure ("edit the doc, orphan every old receipt") cannot occur.
- **Retire, don't destroy.** A spec version referenced by any receipt can never be row-deleted
  without breaking `replay(receipt)` for every historical run, and sessions store their selected
  spec, so deletion orphans live chats. "Delete" means retire: out of the picker, rows persist,
  sessions fall back to the core default. True row deletion is a separate, rarer action available
  only when no receipt and no session references the version.

## 4. Import matrix

| Source | Incoming vs installed | Behavior |
|---|---|---|
| Plugin update | newer | replace (§3) |
| Plugin update | same version, same hash | no-op |
| Plugin update | same version, different hash | **error** |
| Plugin update | older | blocked, error |
| Manual file | newer | replace |
| Manual file | same | error |
| Manual file | older | blocked, error |

The same-version-different-content case must not be "ignored": otherwise an author who edits a
pipeline and republishes under the same version ships an update that installs, reports success,
and silently doesn't apply. Activation is atomic — a plugin shipping three pipelines where one
conflicts activates none (09-PLUGIN-LIFECYCLE §6).

## 5. Boot-time spec sync

1. Scan registered spec modules (core dirs + `contrib/`, later: installed plugins).
2. Compute canonical form and hash; compare against the stored version per §3.
3. **Never touch `node_overrides`** — they key on `node_key` and survive version bumps for keys
   that persist.
4. Reject `core:`-prefixed ids from outside core directories (F2).

Dev loop: Vite restarts the server on save → sync re-runs → L2 shows the new version. This one
mechanism is the entire "pull source, add a file, it appears" story.

## 6. Configuration resolution

Effective config = base ⊕ overrides, resolved **per slot** at run start and recorded in the
receipt. Full model in 12-CONFIGURATION. Schema-side essentials:

- `scope_ref` is split into `(scope_kind, scope_id)`.
- Resolution order per `(node_key, slot_key, path)`, first hit wins:
  **chat → user → active preset → instance → author default.**
- Slots resolve **independently**. A user's prompt override never drags along a connection, so an
  admin's connection change reaches everyone automatically (F20).
- "Reset to defaults" is a `DELETE` scoped by version, key, slot and paths.
- Export offers **base** or **flattened** — explicitly, never silently flattened.
- Resolve the whole effective config once per run into memory; never query per node.

## 7. Type and settings migrations — one definition, two executors

A type author declares **one** migration function. It runs as a document transform (SDK
`/migrate`, for packaged specs) and as a row transform (host data migration for installed specs),
stamping `migrated_from`. Plugin **settings** schemas use the same mechanism.

Orphaned config — from a migration, or from a same-kind node type swap where the new type doesn't
declare a slot — is **never silently dropped and never silently applied**. It lands in
`spec_diagnostics` and renders as orphaned with a restore path.

## 8. Diagnostics by query

The reward for rows. Validation that can't be a constraint runs at the app layer and **writes
findings to `spec_diagnostics`**, so "what's broken and why" is itself queryable and joinable
against receipts.

```sql
-- Deprecation audit (the npm-audit view)
SELECT s.name, sv.semver, n.node_key, n.type_id, n.type_version, t.status
FROM pipeline_nodes n
JOIN type_registry t           ON t.type_id = n.type_id AND t.version = n.type_version
JOIN pipeline_spec_versions sv ON sv.id = n.spec_version_id
JOIN pipeline_specs s          ON s.id = sv.spec_id
WHERE t.status <> 'live';
```

- **Uninstall impact:** `WHERE n.type_id LIKE 'pluginX:%'`.
- **Linearity check:** recursive CTE over `pipeline_edges` — F25 makes this stricter and simpler
  than the old DAG check.
- **Event-cycle check:** the same CTE shape over `event_subscriptions` (F9).
- **Support query of record:** specs whose last N runs failed at the same node, joined with that
  node's type status.
- **Halt analysis:** `receipts WHERE outcome='halt' GROUP BY halt_node_key` — the first question
  asked about any event-triggered pipeline, and unanswerable without `halt_reason`.
- **Trust metric:** review decisions joined per consumer target → edit rate per plugin ("you've
  modified 80% of this plugin's commits"), surfaced next to the gate toggle.

## 9. Guardrails (review checklist)

- [ ] New column proposed → is it a constitutional concept? If type-specific → jsonb (F5).
- [ ] New execution-affecting column → does it round-trip to the document schema? (F4)
- [ ] Editor code path → does it write rows only, never a doc blob? (F3)
- [ ] Config write → overrides only, per slot, correct scope? (F20)
- [ ] Migration → single declared function, both executors covered? (§7)
- [ ] Sync change → overrides untouched? `core:` prefix enforced? version-vs-hash honored? (§3, §5)
- [ ] Deletion path → does any receipt or session reference this version? Retire instead. (§3)
