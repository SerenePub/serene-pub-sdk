# 12 — Configuration, Portability and Localization

**Status:** New, consolidated 2026-08-17. **Closes** the override-scope-hierarchy question that
v2 flagged as must-close-before-L2. Implements F20–F21.

## 1. Separate the concerns; presets select, they never contain

Do **not** make a single Configuration object load-bearing for prompts, templates and connections
together.

The failure is concrete: a user customizes their prompts, the admin later switches that node's
connection to a faster model, and the user's bundled copy keeps the stale connection. Bundling
turns "admins control compute and credentials" into a promise that quietly stops being true the
moment any user customizes anything.

Instead, **each slot resolves independently**, and a **preset** is a named *set of pointers* to
slot values — so selecting a preset never forks the slots it doesn't speak to.

## 2. The addressable things, and the chain

| | What it is | Addressed by |
|---|---|---|
| **Pipeline** | order of operations; a standalone entity, unrunnable without the rest or their defaults | `spec_version_id` |
| **Prompts** | the authored text fields a Provider node declares — primary, post-history, topical, … shape depends on the node | `(node_key, slot_key, path)` |
| **Template** | Source **and engine**. Two levels (16 §3b): a **source** template on a Query or render Task turns one item into text; the **assembly** template on Assemble turns allocated blocks into the final context. The language is a registry entry, not a constant — §2a | `(node_key, slot_key)` |
| **Connection** | adapter + credentials the Provider requires | `(node_key, slot_key)` |
| **Sampling** | generation parameters handed to the connection adapter — temperature, top_p, repetition penalty; steps and cfg for image-gen; voice and speed for TTS. A **reference** to a named `sampling_configs` row, typed by shape | `(node_key, slot_key, path)`; `$ref` swaps the whole config |
| **Params** | node *behaviour* knobs never sent to a service — retrieval `topK`, chunk size, and a retrieval node's **own** `weight`, `minInclude` and `priority`, which it emits as metadata for Assemble to resolve (16 §5a). Assemble's params hold only the global budget, truncation and normalization. **Declared by the node type, never by its kind** | `(node_key, slot_key, path)` |
| **Settings** | node toggles, review position | `(node_key, slot_key, path)` |

**Sampling vs params is decided by where the value goes.** Sampling is forwarded to the adapter
uninterpreted by core; params shape what the node itself does. Like connections, sampling configs
are named reusable entities a node *references*, which is what lets a user keep "creative" and
"precise" presets and swap them across every pipeline that generates text.

**Two override forms** (17 §1b): swap the whole config with a `$ref` override, or override a single
field on top of whichever config is referenced. So a user nudges temperature on one node without
forking a preset, and an admin changing the pipeline's default still reaches every field that user
hasn't touched.

**⚠ Receipts record which sampling fields the adapter applied and which it ignored.** Backends
differ — mirostat exists on some and not others — and silently dropped samplers are one of the most
common confusions in this product category.

*Naming: "prompt config" and "context config" were one letter apart in meaning and collided with
the node's `config` jsonb column. They are **Prompts** and **Template**.*

Slot declarations live in the type descriptor, like facets — so a plugin Provider's prompt fields
render next to core's automatically, with no UI work.

### 2a. Template engines are a registry

*New 2026-08-18.* "Jinja" was written into the slot declaration as a constant, which quietly said
*there is one template language and core owns it*. An extension shipping its own compiler had
nowhere to register it, and a stored template had no way to say what it was written in.

**The engine is a namespaced, versioned registry id like everything else** (F2), and it travels
**on the value**, not only on the declaration: a template slot stores `{ engine, source }`. Core
ships `core:template/jinja2@1` and `core:template/plain@1`; a plugin registers its own.

**Two slots in one spec may use different engines**, and that is safe for a structural reason
rather than by luck: source templates render *before* Assemble (16 §3b, enforced by port shapes),
so only text crosses into allocation. The budget never sees a template and cannot be confused by a
mixture.

**An engine declares four things, and the fourth is load-bearing:**

| Member | For |
|---|---|
| `render(source, scope)` | the obvious one |
| `extract(source)` | the editor's variable list, and publish-time checking (16 §4) |
| `check(source, declared)` | diagnostics against the slot's declared `variables` (13 §7j-a) |
| **`costProfile(source, count)`** | the budget ceiling (16 §7) |

The cost profile is a static analysis — literals outside loops counted once, literals inside a loop
counted once and charged per iteration, conditionals taking their largest branch — and only whoever
understands the syntax can do it. **An engine that cannot analyse itself is still legal:** it
returns `exact: false`, Assemble widens its safety margin, and the receipt records that the estimate
was approximate. A sloppy engine costs its users context headroom rather than correctness, which is
a pressure gradient rather than a ban.

**Every slot is node-local except two.** `template`, `prompts` and `params` belong to the node that
declares them and are never shared. `connection` and `sampling` describe an *external call*, so only
Providers own them — and other nodes may **reference** a Provider's, to read metadata such as the
context window and tokenizer (16 §5b-i). Material is never readable by anything.

References resolve at publish and are stored explicitly, so nothing implicit reaches runtime, and an
ambiguous resolution is a publish error naming the candidates rather than a silent choice.

**Resolution order** per `(node_key, slot_key, path)`, first hit wins, evaluated independently per
path:

1. **Chat scope** — set by the chat's owner
2. **User scope**
3. **Active preset** — the chat's selection, else the user's, else the instance default
4. **Instance scope** — admin, applies to everyone
5. **Spec author default**

Resolved once at run start and recorded in the receipt. Never queried per node.

## 3. Presets

Admin-owned named selections across a pipeline: "my fast-local setup", "quality setup". A preset
holds override rows at `scope_kind='preset'`; users and chats *select* one via
`config_selections`.

- Deleting a preset with live selections reassigns to the instance default; it never
  cascade-deletes selections.
- Admins may define multiple presets per pipeline — different prompts, templates, or a specific
  connection where one model performs a task better than the default.

## 3a. Author-shipped presets

*New 2026-08-18.* Layer 5 of the chain is **one** author default per slot. That is enough to express
a single opinion and no help at all for *"here are three coherent ways to run this"* — which is
exactly what a plugin shipping a chat pipeline needs. A custom RP pipeline wants to arrive with
**Balanced / Lore-heavy / Fast**, each a coordinated set of prompts, weights and templates.

**A spec therefore carries named presets, declared after its nodes:**

```ts
.preset('lore-heavy', { label: 'Lore-heavy', description: 'Favours world detail over history.' }, p => p
  .params  ('lore',     { weight: 0.5, minInclude: 3 })
  .prompts ('generate', { system: LORE_SYSTEM })
  .template('prompt',   jinja(LORE_ASSEMBLY)))
```

**This needs no schema.** A preset's values are flat `(node_key, slot, value)` rows — exactly what
`node_overrides` already stores — so installing a spec seeds `config_presets` plus override rows at
`scope_kind='preset'`. Both tables exist (§3). Presets are execution-affecting, so they live in the
document and round-trip (F3, F4).

Three rules, each with a reason rather than a preference:

- **At most one shipped default.** A second is refused at authoring time. The admin chooses among
  the rest; the author gets one opinion about where to start.
- **An author preset may never set `connection`.** There is no `.connection()` method on the preset
  builder at all — the enforcement is the absence, not a rule someone checks. The reason is §4's
  admin cascade: it works *because* connection has no writable scope below instance, so an admin's
  choice reaches every user automatically. An author preset pinning compute would insert a layer
  underneath the admin and break the one guarantee the write matrix exists to make. Authors ship
  *behaviour*; admins own compute and credentials.
- **Author presets are read-only to admins; an admin clones to modify.** Otherwise a plugin update
  either clobbers an admin's edit or can never change its own preset again. Same shape as
  "published rows are frozen" (02 §3) and "retire, don't destroy."

**Addressing is typed.** The preset builder is parameterised by the same accumulated node map the
chain scope uses (04 §4a-i), so a preset naming a node that doesn't exist is a compile error, and
one setting a slot the node never declared is a publish error. Both would otherwise become override
rows that match nothing — and a preset that silently does nothing is worse than one that fails,
because the user reports it as "the plugin doesn't work."

### 3b. Slugs and ownership — how a seeded preset survives an update

*Ruled 2026-08-18.* A preset carries a **slug**: lowercase kebab, unique per spec, and the reference
an extension update or a core defaults sync matches on. Same convention already ruled for the events
registry (13 §7g), now stated once and applied to **every seeded row** — presets, prompt configs,
context templates, variable templates, sampling configs, node types, surfaces, shapes. One identity
convention rather than six.

**The slug is the identity; the label is the display.** So renaming *"Lore-heavy"* to
*"World-focused"* is free and keeps every user's selection intact, and changing a *slug* is a delete
plus a create. Authors should know which of the two they are doing.

**A slug answers identity but not authority**, and sync needs both. Each seeded row also carries an
**owner**: `core`, a `plugin_id`, or `admin`.

| Situation | What sync does |
|---|---|
| Update ships a preset with a known slug | replace the row and its author-origin override rows |
| Update drops a slug that exists locally | **retire, don't delete** (02 §3) — still resolvable for anyone who has it selected, not offered for new selections |
| A row owned by `admin` | never touched, whatever its slug |
| An admin clones an author preset | the clone is `owner='admin'` with a derived slug, so the next update cannot clobber it |

That last row is what makes *"author presets are read-only, clone to modify"* (§3a) work across
updates rather than only at a point in time.

**Retirement beats deletion for the same reason it does for spec versions.** 12 §3 already says
deleting a preset with live selections reassigns to the instance default and never cascade-deletes
selections; retiring is the gentler form — a chat mid-conversation keeps behaving the way it was
behaving, and the preset simply stops appearing in the picker.

**Ownership at the preset subsumes the per-row origin flag** that §3a's override rows would otherwise
need: rows at `scope_kind='preset'` inherit the preset's owner, so only overrides written at
*instance* scope need their own marker.

## 4. Who may write what, where

| Slot | Author | Instance (admin) | Preset (admin) | User | Chat (owner) |
|---|---|---|---|---|---|
| connection | default | ✔ | ✔ | ✖ | ✖ |
| sampling | default | ✔ | ✔ | ✔ | ✔ |
| template | default | ✔ | ✔ | opt-in per instance | opt-in per instance |
| prompts | default | ✔ | ✔ | ✔ | ✔ |
| params | default | ✔ | ✔ | ✔ | ✔ |
| settings | default | ✔ | ✔ | ✔ | ✔ |

**`params` is why nothing in this design switches on modality.** Because the parameter schema is
declared by the *node type* rather than by its kind, an LLM node's `temperature`, a TTS node's
`voice` and a ComfyUI node's `steps` are the same object to the scope chain, the lens view, the
pipeline view, export/import and this permission matrix. Adding a modality touches none of them
(17 §7).

**The admin cascade needs no mechanism of its own.** Connections have no writable scope at layers
1–2, so an admin's connection reaches every user automatically — including users with heavily
customized prompts — because there is nothing above it to shadow it. That falls out of the write
matrix rather than requiring its own rule, which is the argument for per-slot permissions over
per-layer ones.

**An admin's default ends and a user's begins at the slot, not at the layer.** A matrix, not a
line.

A user changing a setting for a chat they own affects only that chat. **Open:** who owns a chat
with several participants (13 §4).

## 5. Node swapping

A **swap** is kind-for-kind with compatible definitions — a Task for another Task, a Provider for
another Provider. Adding or removing nodes, or changing a kind, is structural editing and is not a
swap.

Because typed ports make compatibility statically checkable (01 §3), the UI can present a list of
**valid** replacements rather than letting a user discover a mismatch at runtime. A user clones a
default pipeline and swaps a core Task for one an installed extension provides; SP already knows
which options are legal.

Swapping is offered as a **constrained override** — same kind, exact shape match on every port —
so a user's tuning survives upgrades rather than being stranded in a private clone. Slots the new
type doesn't declare land in `spec_diagnostics` as orphaned, never silently dropped, never
silently applied.

## 6. Plugin settings

Same schema strategy as node config and review steps — one renderer, **four** uses. Values are
stored as JSON in `plugins.settings`; **the schema itself lives in the manifest**, extracted
statically by the compiler and never by running the author's code (F6, 03 §3). The schema
segregates **extension-side** (requestable through the SDK at any time) from **component-side**
(fed in at render, arriving through `ctx`).

```ts
export const settings = defineSettings({
  endpoint: { type: 'string', label: 'API endpoint', required: true, scope: 'instance', group: 'Connection' },
  apiKey:   { type: 'secret', label: 'API key',      required: true, scope: 'instance', group: 'Connection' },
  mode:     { type: 'enum', of: ['simple', 'advanced'] as const, default: 'simple' },
  retries:  { type: 'integer', default: 2, min: 0, max: 10, showIf: { field: 'mode', equals: 'advanced' } },
})
```

**One declaration, four uses:** the form core renders with no UI work by the author; validation of
stored values on save and on update; the manifest entry; and **typed access from the extension's own
hooks**, so `apiKey` is a secret value and a mistyped key does not compile.

**The declaration is a literal, not assembled at runtime** — a schema built by code cannot be read
without executing the author's code, which the packager never does.

**A schema that would leak cannot be constructed.** `defineSettings` throws rather than returning
findings for: a component-side secret (a component runs in the browser), a secret with a default (a
shipped default credential is not a credential), an enum with no options, and a `showIf` naming a
field that does not exist.

**Unconfigured is not broken.** A `required` field with no value puts the plugin in
**`needs-configuration`** — installed, listed, and naming exactly what it is waiting for. That is a
distinct state from `broken`: one means file a bug against the author, the other means type an API
key, and a plugin that silently does nothing is the worst of both.

**On update, values reconcile rather than reset.** Fields the new schema no longer declares are
**orphaned, not deleted** — the same rule 12 §5 applies to a slot orphaned by a node swap, so a
downgrade can still recover them. Newly added fields take their declared default. Anything now
invalid is reported rather than silently coerced. An orphaned *secret* is reported without its value.

- A settings change reaching a mounted component is an `update(handle, props)` — no second
  channel.
- **Declare a write scope per field**, `instance` or `user`, mirroring §4. Admin-only is the right
  default since plugins are admin-installed, but display preferences are naturally per-user, and
  retrofitting scope once instance-scoped settings exist in the wild is the migration this design
  keeps avoiding.
- Schema changes on update reuse the migration story in 02 §7; unmigrated values land in
  diagnostics rather than disappearing.
- **Ruled: a typed `secret` field** (13 §6, 03 §8). Write-only in the UI, encrypted at rest with
  the app secret, returned only into the declaring extension's own hook invocation context. Never
  readable through the SDK data API, never recorded in a receipt, never exported. The *type* is
  what makes those three enforceable — a free-form column cannot tell a key from a note.

## 7. Export and import

**Users export what they own, not their account.** The account is not a portable object, and there
is no bulk user export or programmatic deletion path (F29).

| Exportable | By | Contents |
|---|---|---|
| Persona cards | owner | individually or bundled |
| Chats | owner | individually or bundled |
| Prompt configs | owner | individually or bundled |
| Pipelines | admin | spec document |
| Pipeline configs / presets | admin | **minus connection details** |

- A single **zipped bundle** carries all of a user's owned personas, chats and prompt configs at
  once; core imports the bundle or any item individually. Some item types already have import
  support and keep it.
- **Prompts and templates are married to the node type they configure.** Export records the
  `type_id@version` and slot they belong to, so import validates compatibility instead of pasting
  text into a node whose shape doesn't match.
- Connection details never leave. An exported pipeline config carries slot values for prompts,
  templates and settings, and *references* connection kinds without credentials.
- Pipeline export offers **base** or **flattened**, explicitly, never silently flattened (02 §6).

### 7a. Presets travel with an export, and the user chooses which

*Ruled 2026-08-18.* Exporting a custom pipeline from the app lets the user **select which presets to
include**; the SDK's compile ships every preset the author wrote, because at compile time there is no
instance and nothing to choose from.

- **A filtered export is a different document, not a lossy copy of the same one**, so its canonical
  hash legitimately differs from the source's. F3's identity law is that a given export round-trips
  — `import(export(x)) === export(x)` — and that still holds exactly. Asserting the stronger reading
  would make choosing impossible.
- **Preset bindings follow the same base/flattened fork** as the pipeline itself (02 §6), and for the
  same reason it must be explicit. `base` keeps `$ref` references by slug, portable only where the
  target is itself a seeded, slugged row (§3b); `flattened` inlines the values, always portable and
  it forks the config so the importing instance can no longer swap the named thing in one place.
- **Connection bindings never leave, in either mode.** Already the rule; now enforced at the export
  boundary rather than left to a filter.
- **Nothing is dropped silently.** An export reports what did not travel and why — an unselected
  preset, an unresolvable reference, a stripped connection, and the case worth naming on its own:
  **the shipped default was not selected, so the import arrives with no default.**
- **Receipts are not exportable** (13 §2). They are diagnostic logging, not a user asset — the chat
  already carries the content a user would want back. They are retained by an admin policy (last N
  runs or M bytes, whichever trips first) and **cascade-delete with the user**: a receipt records
  Provider I/O verbatim (F16), so "diagnostic" governs export, not retention after removal.
- **Secret-typed settings never leave**, on the same footing as connection credentials.

## 8. Localization

Phase 1 ships **English only, with the `i18n` fallback structure in place** — so adding locales is
additive rather than a breaking change to every descriptor and manifest.

- Author-supplied strings are **locale maps with a required `en` key**, not bare strings: node
  titles and descriptions, settings labels, review field labels, event descriptions, notification
  text, mode names, component names.
- A bare string is accepted and treated as `{ en: value }`, so nothing breaks today.
- Resolution: `requested → en → key`.
- `ctx.locale` for components; the same table via the SDK for extensions (04 §7).
- **Recommended strategy for mods:** keep strings in one module per plugin, key by a stable id,
  never concatenate translated fragments, and let SP resolve — plugins should not ship their own
  i18n runtime.
