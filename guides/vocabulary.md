# Vocabulary

These words carry you through your first plugin. Each has one sentence, one example and a
link to its entry in the canon, [`NOMENCLATURE.md`](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md),
the full list of Serene Pub's words. You will not need the canon for a first plugin. The other
guides use these words exactly as defined here, and define any other word where it first
appears. Learn them in this order: each group leans on the one before it.

## What you ship

### plugin

A package that an administrator installs, and can uninstall as a unit.
`defineExtension({ slug: 'acme.dice', … })` declares one. Its **slug** (`acme.dice`) is the
namespace every id it declares sits under.
[Canon §12](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#12-extensions)

### genre

A kind of session (Chat, Adventure, a game of your own), and the owner of the pipelines its
sessions run.
`use('core:genre/chat')` names core's Chat genre.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### spec

A pipeline you publish: a graph of steps, versioned by semver. The guides say "pipeline" in
prose; the SDK's functions say `spec`.
`spec('acme.greeter:reply', { version: '1.0.0' })` starts one.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

## Inside a spec

### node

One step in a spec, named by a key and added with the builder method for its kind.
`.task('prompt', () => C.assemble.v2())` adds the node `prompt`.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### inlet

The kind of node a run enters by. Exactly one per spec, first, and it ties the spec to one genre
and one event. Only core ships inlets.
`.inlet('input', C.userMessage.v1(), { genre, event: sessionEvents.messageRespond })`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### query

The kind of node that reads. Core's queries read Serene Pub's data; yours read your plugin's own
storage. A query never reaches the network.
`.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### task

The kind of node that computes: the same input always gives the same output, with no storage
and no network.
`.task('roll', roll.v1({ notation: '1d20' }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### oracle

The kind of node that calls out to something outside the run, such as a model or a web API.
`.oracle('generate', ($) => C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### outlet

The kind of node that writes: a run leaves into the world here.
`.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### port

A node's named input or output. One node's output port is wired into another's input port.
`ports: { in: { notation: S.text }, out: { main: S.text } }`.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

## Your own code

### node definition

A named, versioned declaration of what a node takes and gives, and which kind it is.
`describeTaskDefinition({ id: 'acme.dice:roll@1', ports: { … } })`.
[Canon §5](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#5-catalog)

### handler

The function behind a node definition: it takes `(input, ctx)` and returns a result.
`handler(roll, async (input, ctx) => ok({ main: '…' }))`.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### pin

The node definition, at one version, that a node runs unless a session swaps it.
`roll.v1({ notation: '1d20' })` pins `acme.dice:roll@1`.
[Canon §9, under swap](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### swap

Another node definition a session may run on a node in place of its pin.
`expose: { swaps: ['core:task/turn-random@1'] }` offers one.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### receipt

The record of a run: each node, its outcome, its inputs and outputs, and what went wrong.
`ctx.run({ … })` in the playground returns one, and the **Result** tab draws it.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

## What starts a run

### event

Something that happened in a session. A spec answers one through its inlet. Core records its
own events, and a plugin can declare and record its own.
`sessionEvents.messageRespond` is `core:event/message-respond@1`.
[Canon §9, under action](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### action

Anything a person can press: a composer button, a message-menu item, a slash command, a button in
a widget. It is declared on the spec that answers it.
`contributes: { actions: [{ key: 'roll', label: 'Roll', description: 'Roll the dice and post the result.', venue: { kind: 'composer' } }] }`.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

## What a session holds

### declared setting

A session-settings control that exists because a declaration named it: a genre field, a swap
or a node's option.
`shape: { fields: { autoAdvance: AUTO_ADVANCE_FIELD } }` declares one on a genre.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### annex

The session's own JSON, kept per package, where each key says who may see it. Widgets read it;
pipelines write it.
`C.setSessionAnnex.v1({ … })` writes your part of it.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### turn order

Who speaks next, in order. It is stored in the session and changes only when a pipeline writes
it.
`core:outlet/set-turn-order@1` writes it.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### turn strategy

The node that decides the turn order. A plugin can offer its own as a swap.
`core:task/turn-round-robin@1` is core's default.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

## What a person sees

### widget

A box in the session screen that a person places, with its own settings.
`widget({ id: 'party-stats', title: 'Party stats', component: 'party-stats' })`.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### component

The code that draws a widget: Svelte or plain DOM, run in the page's worker.
`component({ slug: 'party-stats', label: 'Party stats', entry: './party-stats.ts', framework: 'svelte' })`.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### host element

An element a component may place: plain HTML, plus the `sp-*` elements the app draws with its own
controls.
`<sp-popover>` is one; `SP_HOST_ELEMENTS` lists them all.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

## What holds you to it

### conformance

The numbered checks a package is held to, each one runnable from a test.
`conformPackage(…)` runs the package checks against your built plugin.
[Canon §25, package conformance](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#25-change-ledger)

## Words you can skip for now

- **session preset**: which pipelines a new session of a genre runs. You meet it when your
  plugin ships a genre.
- **shape**: the type of a port, such as `S.text`.
- **channel**: a named stream of a session's messages. Every session has `main`; a genre can
  declare more. See [Channels](channels.md).
- **live row**: the one reply message a run opens and streams into. See [Channels](channels.md).
- **frame**: a whole HTML document of yours, shown in a sandboxed iframe: in a widget, in place
  of the message list, or as a page of its own. See [Frames](frames.md).
- **permission**: what your plugin's code may do beyond computing, such as use storage or reach
  a network host. Your plugin asks; an administrator grants or refuses. See
  [What a plugin may do](plugin-permissions.md).
- **subject**: what a pipeline serves (an event or an action), which decides what it may record.
  See [Events](events.md).

Where a value comes from (a node's options, a genre field, the node definition a session runs)
is [its own page](where-values-come-from.md).
