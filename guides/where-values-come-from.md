# Where values come from

A run never asks "what is this value?" once. It asks each layer in turn, nearest first, and takes
the first answer. When you change something and nothing happens, a nearer layer answered first.
This page lists the layers for every kind of value a plugin meets. The words are the ones in the
[vocabulary](vocabulary.md).

## The whole picture

```text
                  nearest ───────────────────────────────────────────────────────▶ furthest

a node's options  session override ─▶ selected config ─▶ pub defaults ─▶ node default
                                      │
                                      └ which config: the session's pick ─▶ the session
                                        preset's ─▶ the admin's ─▶ the spec's shipped config

a genre field     session value ─▶ genre setting ─▶ the field's default

a node's          session swap ─▶ pub swap ─▶ pin
definition

which spec        session binding ─▶ session preset ─▶ pub binding ─▶ the genre's own
answers an event

a widget setting  the person's value ─▶ the field's default

an attribute      nearest owner's value ─▶ … ─▶ furthest owner's value ─▶ the slot's default

a plugin setting  the person's value (scope 'user') ─▶ the administrator's ─▶ the default

the annex,        stored, or absent: no layers
the turn order
```

## Layer by layer

**A node's options.** The options a node takes (its params, the model it calls, its prompts):

1. The session's **override**, set in that session's settings.
2. The selected **config**: a named set of options for the spec.
3. The pub defaults an admin set: the default model and sampling, for example.
4. The default the node definition declares.

**Which config is selected.** The session's pick, then the session preset's, then the
administrator's pick for the pub, then the spec's shipped config (the one your spec
declares with `.preset(…, { default: true })`).

**A genre field.** The session's value (kept only while the genre declares the field), then the
value the genre pins in its `settings`, then the field's own default.

**The node definition a node runs.** The session's swap, while the node still offers it; then an
pub swap; then the pin in the spec. A swap whose ports do not fit the node falls back to the
pin. The app has no way to set an pub swap yet, so in practice a swap is a session's choice.

**Which spec answers an event or an action.** The session's binding, then the session preset's
(events only), then the pub's binding, then the genre owner's spec, or else the first one
published.

**A widget setting.** The person's value for this widget in this session, then the field's
default in the widget's declaration. A layout that ships `widgetSettings` is not a layer: when a
session takes the layout, its values are copied into the person's values once.

**The layout.** No layers. Each person keeps a whole layout per session. A new session copies the
person's own new-session layout for the genre, or else the genre's default layout. Changing a
layout later changes no session that already copied it.

**An attribute value** (a stat or a state). The value in force on the nearest owner: a cast
member in this session, then the cast member, then the character card; or the session, then the
lorebook. Then the slot's declared default. A derived slot is computed on every read and never
stored.

**A plugin setting.** For a field declared `scope: 'user'`, the value the person the call acts
for saved; then the value an administrator saved for everyone; then the declared default. A
call that acts for no one (a lifecycle callback) starts at the administrator's value.

**The annex.** No layers. A key is stored or absent. A pipeline writes it with
`set-session-annex`, merging per package.

**The turn order.** No layers. It is stored in the session, written by
`core:outlet/set-turn-order@1`, and read as it is. Nothing recomputes it.

Two things that are easy to miss:

- **A config is one layer, not a stack.** The shipped config and an administrator's config are
  alternatives: the selection picks one. A new config starts from the node defaults, not from the
  shipped one. Duplicate the shipped config to start from it.
- **A declared setting belongs to the genre.** A session keeps a genre field's value only while
  its genre declares that field. A value the genre pins without declaring a field has no control
  in session settings, and every run reads it.

## What a run reads

A run gets these values already resolved, in one settings document (`SessionSettingsV1`): the
genre fields, the cast and channels, each pipeline's session swaps and overrides, the turn order
and the whole annex. A widget gets a narrower copy, without the pipelines or the annex, and
reads its own view of the annex separately: only the keys it may see.

## What the receipt says

A run's receipt records what ran and which layer chose it:

- **Options.** Each node's row carries `configLayers`: for every option the node resolved, the
  layer that answered: `session`, `config`, `defaults` or `author` (the node definition's
  default). `configLayers.params.weight === 'session'` means the session's override won. The
  row's `input` shows the values themselves.
- **Swaps.** Each node's row carries the `definitionId` that actually ran. `swap` is `null` when
  the spec's pin ran, or `{ pin, by }` when a swap ran: `pin` names the definition it replaced and
  `by` is `session` or `pub`.
- **Bindings.** When the session preset's binding could not serve and a lower layer chose the
  spec, the receipt says so in `meta.preset`.
- **The spec.** Every receipt names the spec and the version that ran (`specId`,
  `specVersion`), so a spec edited since is never mistaken for the one that answered.
