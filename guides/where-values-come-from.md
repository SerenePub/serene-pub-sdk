# Where values come from

A run never asks "what is this value?" once. It asks each layer in turn, nearest first, and takes
the first answer. When you change something and nothing happens, a nearer layer answered first.
This page lists the layers for every kind of value a plugin meets. The words are the ones in the
[vocabulary](vocabulary.md).

## The whole picture

```text
                  nearest ───────────────────────────────────────────────────────▶ furthest

a step's values   the session (what is exposed) ─▶ the preset's changes ─▶ the genre's
                  defaults ─▶ the pipeline's declared defaults ─▶ the node default

a genre setting   the session ─▶ the preset ─▶ the genre's defaults ─▶ the field's default
                  (a layer may lock it: nothing nearer changes it)

which pipelines   the session's rows ─▶ the preset's changes ─▶ the genre's defaults
run, and on what

routine caps      the routine's own ≤ the session owner's ≤ the pub's
(real-time clock)

a node's          session swap ─▶ pub swap ─▶ pin
definition

a widget setting  the person's value ─▶ the field's default

an attribute      nearest owner's value ─▶ … ─▶ furthest owner's value ─▶ the slot's default

a plugin setting  the person's value (scope 'user') ─▶ the administrator's ─▶ the default

the annex,        stored, or absent: no layers
the turn order
```

There are no named configurations: a pipeline's values come from one cascade, and the pieces a
step points at (prompts, context templates, variable layouts, sampling configs, loadouts) are
libraries an administrator picks from.

## Layer by layer

**A step's values.** What a step takes (its params, its prompt, its template, the loadout and
sampling it runs on):

1. The **session**: a value set in that session's settings. A session's owner reaches only what
   the step **exposes** to them; an administrator reaches everything but the connection, which a
   session never names.
2. The **preset's changes**: the `values` on the preset's `change` of that registration (or on a
   registration the preset adds).
3. The **genre's defaults**: the `values` on the registration in the genre's defaults, and what an
   administrator saves for the genre on the pipeline's page.
4. The pipeline's **instance values**: what an administrator saves on the pipeline's page for a
   pipeline no genre registers (a card's portrait, its likeness), on this pub alone.
5. The pipeline's **declared defaults**: what your spec states with `.defaults((p) => …)`.
6. The default the node definition declares, and under it the pub's loadouts.

Values are stored **by registration**, never by a flat key: two registered pipelines may both
have a `mode`, and a session's value for one never reaches the other. When a preset change drops
a pipeline, the session's values for it stay, unread, and come back if the pipeline does.

**A genre setting.** The same layers for the genre's own fields: the session's value, then the
preset's `settings`, then the genre's defaults' `settings`, then the field's own default. Each
layer may **lock** a value (`setting('scripts', { lock: true })`): nothing nearer may change it,
and a session shows it read-only. A field reaches a session's owner only when it declares
`reach: 'owner'`; model plumbing (a connection, sampling, a loadout, a prompt's text, a template)
never does, and a declaration that tries is refused. The one choice a step may hand its owner is
**which prompt** it writes from: `{ expose: { promptReach: 'owner' } }` on a step with a prompts
slot offers the owner the slot's prompts an administrator has not hidden, never their text. A field marked `fixedAtStart` is settled when the
session is created: asked on the start form when the owner may set it, else taken from the
layers, and read-only afterwards. A preset marks an owner-open field `askAtStart` to put it on
the start form.

**Which pipelines run.** The genre's defaults register a pipeline on each trigger (an event, an
action, a routine's cadence). A preset is one set of changes on them: it registers more, drops
some, or changes one's values, mode or `when`. A session may switch an action or a routine off
and back on. One event may run several registrations, in their declared `order`; each one's
`when` (absent means always) decides whether it runs this time. A registration that stops fitting
(a package update made its pipeline read something its trigger does not carry) is set aside with
a notice, and the layer under it answers.

**Routine caps.** A routine on the real-time clock stops after the session has had no
interaction for a while, or after so many runs in a row. The pub sets the most; each person may
set less for their own sessions; an administrator may set less for one routine.

**The node definition a node runs.** The session's swap, while the node still offers it; then a
pub swap; then the pin in the spec. A swap whose ports do not fit the node falls back to the
pin. The app has no way to set a pub swap yet, so in practice a swap is a session's choice.

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
`core:outlet/set-turn-order@1`, and read as it is: no layer recomputes it when it is read.
The genre's turn-order pipeline rewrites it. A `turnOrderSpec()` document recomputes the order
each time one of the events it is registered on happens: `TURN_ORDER_EVENTS` (a message
completed, edited, deleted or hidden, a member added or removed, the cast changed, the session
updated or branched), plus `annex-changed` when the genre registers it there too. A turn strategy
sees the turn candidates and the messages, never the annex, so registering it on `annex-changed`
makes an annex write recompute the order without the strategy reading the annex.

Two things that are easy to miss:

- **A preset is one level.** It changes the genre's defaults and never builds on another preset.
  Cloning a preset copies its changes into a new one.
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
  layer that answered: `session`, `preset`, `genre`, `defaults` (the pub's) or `author` (the
  pipeline's or the node definition's own default). `configLayers.params.weight === 'session'`
  means the session's value won. A run recorded before presets became changes may say `config`,
  which reads as `preset`. The row's `input` shows the values themselves.
- **What started it.** The receipt carries `triggerFamily` (`event`, `action` or `routine`) and
  the `registrationKey` that ran it (`message-respond→story-respond`). A routine's receipt says
  `routine ‹name›, for ‹owner›`: a routine acts with the session owner's authority.
- **Swaps.** Each node's row carries the `definitionId` that actually ran. `swap` is `null` when
  the spec's pin ran, or `{ pin, by }` when a swap ran: `pin` names the definition it replaced and
  `by` is `session` or `pub`.
- **A registration set aside.** When a registration could not serve and the layer under it chose
  the pipeline, the receipt's `registrationKey` names the one that actually ran.
- **The spec.** Every receipt names the spec and the version that ran (`specId`,
  `specVersion`), so a spec edited since is never mistaken for the one that answered.
