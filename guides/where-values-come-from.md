# Where values come from

A run never asks "what is this value?" once. It asks each layer in turn, nearest first, and takes
the first answer. When you change something and nothing happens, a nearer layer answered first.
This page lists every layer there is. The words are the ones in the [vocabulary](vocabulary.md),
and the other canon terms link to [`NOMENCLATURE.md`][canon] the first time they appear.

[canon]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md

## The whole picture

```text
                  nearest ───────────────────────────────────────────────────────▶ furthest

a node's params   session override ─▶ selected config ─▶ instance defaults ─▶ node default
                                      │
                                      └ which config: the session's pick ─▶ the session
                                        preset's ─▶ the admin's ─▶ the spec's shipped config

a genre field     session value ─▶ genre setting ─▶ the field's default

a node's          session swap ─▶ instance swap ─▶ pin
definition

which spec        session binding ─▶ session preset ─▶ instance binding ─▶ companion rule
answers an event

a widget setting  the person's value ─▶ the layout preset's value ─▶ the field's default

an attribute      nearest owner's value ─▶ … ─▶ furthest owner's value ─▶ the slot's default

a plugin setting  the administrator's value ─▶ the declared default

the annex,        stored, or absent: no layers
the turn order
```

## Layer by layer

| Value | Layers, nearest first | Stored in | Resolved by |
| --- | --- | --- | --- |
| A node's params, and its other [slots](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline) | 1. The session's [override](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#6-config). 2. The selected [config](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#6-config). 3. Instance defaults: the connection and sampling defaults, and the prompt floors. 4. The default the node definition declares. | 1. `pipeline_node_overrides`. 2. `pipeline_config_values`, which holds only [deviations](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#6-config). 4. The node definition. | `resolveConfigSources` (SDK `config.ts`), walking `SCOPE_ORDER` = `session` · `config` · `defaults` · `author`. The receipt keeps the answer per node as `configLayers`. |
| Which config is selected | 1. The session's pick. 2. The [session preset](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)'s config for the spec. 3. The administrator's pick for the instance. 4. The spec's shipped config, made from its `.preset(…, { default: true })`. | `pipeline_config_selections`, the session preset, `pipeline_configs` | `resolveSelectedConfig` (app), which reports `source`: `session` · `preset` · `instance` · `shipped` |
| A genre field | 1. The session's value, kept only when the genre declares the field. 2. The [genre setting](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session) (`GenreDecl.settings`). 3. The field's own default (`FieldDecl.default`), for a declared field. | 1. `sessions.genre_fields`. 2. The genre declaration. | `cascadeFields` in `resolveSessionSettings` (app) |
| The node definition a node seats | 1. The session's swap, while the node still offers it. 2. An instance swap. 3. The pin in the spec. A swap that does not fit the node's ports falls back to the pin. | `pipeline_node_rebinds` (scope `session` or `instance`) | `applyNodeRebinds` (app), when the run loads |
| Which spec answers an event or an action | 1. The session's binding. 2. The session preset's binding (events only). 3. The instance binding. 4. The companion rule: the genre owner's spec first, else the first published. | `pipeline_bindings` | `resolveSubjectSpec` (app). Session events other than a reply stop at the spec the inlet lock names, after the session and the preset. |
| A widget setting | 1. The person's value. 2. The value the session's layout preset gives it. 3. The field's default in the widget's declaration. | 1. `widget_settings`, which holds only what differs. 2. `session_layout_presets.widget_settings`. | `presetWidgetSettings`, then `effectiveWidgetSettings` (app) |
| The layout the widgets sit in | 1. The session's own layout. 2. The applied layout preset. 3. The person's default for the genre. 4. The genre's layout. 5. The built-in layout. Whole layouts: two are never merged. | `session_panel_layouts`, `session_layout_presets`, `user_layout_defaults` | `resolveLayoutFor` (app), which reports the `tier` that answered |
| An [attribute](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session) value | The value in force on each owner, nearest first: a session's cast member, then the cast member, then the character card; or the session, then the lorebook. Then the slot's declared default. A derived slot is computed on every read and never stored. | `attribute_values`, where the latest row in force per owner wins | `valueOf` (app `state/resolve.ts`); `core:query/session-state@1` for a pipeline, 🚧 `core:query/lorebook-state@1` for the lorebook's own layer alone and `core:query/stat-trail@1` (the stat trail) for one value over time |
| A plugin setting | 1. For a field declared `scope: 'user'`, the value the person the call acts for stored. 2. The value an administrator stored for everyone. 3. The declared default. A call acting for no one (a lifecycle callback) starts at 2. | 1. `plugin_user_settings`, one row per person. 2. `plugins.settings`. | `resolveSettingsFor` in `plugins/settingsHost.ts` (app), over `reconcile` (SDK `settings.ts`) |
| The annex | No layers. A key is stored or absent, and nothing declares a default. An outlet writes it by shallow merge per owner. | `sessions.annex`, with each key's audience in `sessions.annex_audiences` | `core:query/session-annex@1` for a pipeline; `annex.v1` for a widget, holding only the keys it may see |
| The turn order | No layers. It is state, written by `core:outlet/set-turn-order@1` and never recomputed by a reader. | `sessions.metadata.turnOrder` | `readTurnOrder` (SDK), which gives an empty order when nothing is stored |

Three things the table says that are easy to miss:

- **A config is one layer, not a stack.** The shipped config and an administrator's config are
  alternatives: the selection picks one. A new config starts from the node defaults, not from the
  shipped one; duplicate the shipped config to start from it.
- **A declared setting belongs to the genre.** A session keeps a genre field's value only when
  its genre declares that field. A value the genre sets without declaring a field has no
  control, and every run reads it.
- **Nobody wrote an instance swap yet.** The layer is read, but nothing in the app writes one
  today. A swap is a session's choice.

## What a run reads

A run gets these values already resolved, in one [settings document](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)
(`SessionSettingsV1`): the genre fields, the cast and channels, each pipeline's session swaps and
param overrides, the turn order and the whole annex. A widget gets a narrower copy, without the
guests, the pipelines or the annex. It reads its own view of the annex through `annex.v1`.

## What the receipt says

A receipt records what ran and which layer chose it:

- **Params.** Each node's row carries `configLayers`: for every config value the node resolved,
  per slot and path, the layer that answered — `session` (the session's override), `config`
  (the selected config), `defaults` (instance defaults) or `author` (the node definition's
  default). `configLayers.params.weight === 'session'` means the session's override won. A path
  that is not there was never resolved, so the binding used its own fallback. The row's `input`
  and, on an oracle, `samplingApplied` show the values themselves.
- **Swaps.** Each node's row carries the `definitionId` that actually ran, and `swap` says how it
  got there: `null` means the spec's pin ran; `{ pin, by }` means a swap ran, `pin` names the
  definition it replaced and `by` is `session` or `instance`. A host that does not pass
  `RunOptions.swaps` leaves `swap` off, and so does any receipt from before the field existed.
- **Bindings.** When a session preset's binding could not serve and a lower layer chose the spec,
  the host records it on the receipt as `meta.preset` (`ReceiptPresetRoute`, `via: 'fallback'`,
  passed in through `RunOptions.meta`) and keeps a notice on the session preset.
- **The document.** Every receipt names the spec and the version that ran (`specId`,
  `specVersion`), so a spec edited since is never mistaken for the one that answered.
