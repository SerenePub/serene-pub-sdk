# Vocabulary

Twenty-five words carry you through your first plugin. Each one here has one sentence, one
example and a link to its full entry in the canon, [`NOMENCLATURE.md`][canon], which is where
Serene Pub settles what a word means. The [first-plugin guide](your-first-plugin.md) uses only
these words, and links any other term the first time it appears.

Learn them in the order below. Each group leans on the one before it.

[canon]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md

## What you ship

### plugin

A package with a manifest that an administrator installs, and can uninstall as a unit.
`defineExtension({ slug: 'acme.dice', … })` declares one.
[Canon §12](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#12-extensions)

### genre

What kind of session this is, and the owner of the pipelines that sessions of it run.
`use('core:genre/chat')` names core's Chat genre.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### spec

A published pipeline document, versioned by semver.
`spec('acme.greeter:reply', { version: '1.0.0' })` starts one.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

## Inside a spec

### node

One step in a spec, keyed by name and written with the builder verb for its kind.
`.task('prompt', () => C.assemble.v2())` adds the node `prompt`.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### inlet

The kind of node a run enters by: exactly one per spec, first, and it locks the spec to one
genre and one event.
`.inlet('input', C.userMessage.v1(), { genre, event: sessionEvents.messageRespond })`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### query

The kind of node that reads Serene Pub's own data and cannot reach the network.
`.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### task

The kind of node that is a pure transform: the same input always gives the same output.
`.task('roll', roll.v1({ notation: '1d20' }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### oracle

The kind of node that calls out to something nondeterministic outside the run, such as a model.
`.oracle('generate', ($) => C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### outlet

The only kind of node that may write: a run leaves into the world here.
`.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))`.
[Canon §4, node kind](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### port

A node's declared input or output, which another node's value is wired into or read from.
`ports: { in: { notation: S.text }, out: { main: S.text } }`.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

## Your own code

### node definition

A named, versioned declaration of what a node takes and gives, and of the kind it belongs to.
`describeTaskDefinition({ id: 'acme.dice:roll@1', ports: { … } })`.
[Canon §5](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#5-catalog)

### handler

The function a node definition is bound to: it reads an `input` and returns a result.
`handler(roll, async (input, ctx) => ok({ main: '…' }))`.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

### pin

The node definition, at one version, that a node seats unless a session swaps it.
`roll.v1({ notation: '1d20' })` pins `acme.dice:roll@1`.
[Canon §9, under swap](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### swap

Another node definition a session may seat on a node in place of its pin.
`expose: { swaps: ['core:task/turn-random@1'] }` offers one.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### receipt

The durable record of a run: each node, its outcome, the decisions and the diagnostics.
`ctx.run({ … })` in the playground returns one, and the **Result** tab draws it.
[Canon §4](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline)

## What starts a run

### event

Something that happened in a session, which a spec answers by its inlet lock: core's, or one a
package declares and an outlet records.
`sessionEvents.messageRespond` is `core:event/message-respond@1`.
[Canon §9, under action](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### action

Anything a person or an AI-voiced participant invokes, such as a composer button, a message-menu
item or a slash command.
`contributes: { actions: [{ key: 'roll', label: 'Roll', description: 'Roll the dice and post the result.', venue: { kind: 'composer' }, … }] }` — the `description` is required.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

## What a session holds

### declared setting

A session-settings control that exists because a declaration named it: a genre field, a swap
or a param.
`shape: { fields: { autoAdvance: AUTO_ADVANCE_FIELD } }` declares one on a genre.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### annex

The session's JSON that pipelines own, namespaced by owner, with an audience on each key.
`C.setSessionAnnex.v1({ … })` writes your part of it.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### turn order

The session's ordered list of prepared turns, kept as state and never recomputed by a reader.
`core:outlet/set-turn-order@1` writes it; the composer line reads it.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### turn strategy

The swappable node that turns the turn candidates into the entries of a turn order.
`core:task/turn-round-robin@1` is core's default.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

## What a person sees

### widget

A thing placed in the session view, with its own settings for each participant.
`widget({ id: 'party-stats', title: 'Party stats', component: 'party-stats' })`.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### component

The one unit of custom UI a package declares, which a widget names to draw it.
`component({ slug: 'party-stats', label: 'Party stats', entry: './party-stats.ts', framework: 'svelte' })`.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

### host element

An element the host allows a component to place: plain HTML, plus the `sp-*` elements the host
draws itself.
`<sp-popover>` is one; `SP_HOST_ELEMENTS` lists them all.
[Canon §9](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session)

## What holds you to it

### conformance

The kit of numbered laws a host or a package is held to, each one runnable.
`conformPackage(host)` runs the package cases C28 to C33 against your package.
[Canon §25, package conformance](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#25-change-ledger)

## Words left out on purpose

These are real words, but a first plugin does not need them. Each links to its entry when a page
uses it.

- **session preset**: which pipelines a session of a genre runs. You meet it when you ship one.
- **shape**: a port's shape, such as `S.text`. Read it as part of *port*.
- **subject**, **live row**, **contribution**: words for bindings, streaming and swaps offered
  to other packages. They come up in the [events](events.md) and [widgets](widgets.md) guides.
- **delivery** is retired. An event is heard by everything in its scope.

Where a value comes from (a node's params, a genre field, the node definition a session
seats) is [its own page](where-values-come-from.md).
