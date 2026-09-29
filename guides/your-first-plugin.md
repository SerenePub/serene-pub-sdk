# Your first plugin

This page uses the words in the [vocabulary](vocabulary.md): *plugin*, *spec*, *node*, *pin*
and the rest. Any other term from the canon is linked the first time it appears.

A plugin is three things, and only one of them is code Serene Pub [runs][run].

1. **What it declares.** `defineExtension({...})` says what your plugin is: its name, its
   settings, the node definitions it registers with the handlers behind them, and the specs
   it ships. The packager reads this without executing it.
2. **Documents.** Every spec you write is compiled to a plain document at build time.
   Serene Pub installs the document, never your builder code.
3. **A [manifest].** Computed from your code: which [permissions][permission] it would need,
   which events it answers, which ids it owns. You cannot edit it into saying something else.

That split is the whole security model. Your own build runs your code on your machine.
Serene Pub, at install time, reads data.

:::note Runnable code
Every fence on this page marked **Run in [playground]** executes here, in your browser,
against the SDK's fixture host. Nothing reaches a model: the `generate-text` node is answered
by a stand-in with one fixed reply, so the run is the same on every machine. The receipt you
get is the receipt the test suite gets.
:::

## Set up

```bash
npm install @serene-pub/sdk @serene-pub/contracts
npm install --save-dev @serene-pub/cli
npx serene-pub check .
```

`@serene-pub/contracts` is versioned by the Serene Pub release you compile against: `0.6.x`
compiles against 0.6.x. `@serene-pub/sdk` is versioned by the authoring API. They move on
different clocks on purpose, so bumping one never silently changes the other.

## The spec

Start with the smallest spec that answers a [turn]. Five nodes, one of each kind: an inlet,
a query, a task, an oracle and an outlet, so reading, computing, calling out and writing are
each visible on the page.

```playground ts
import { sessionEvents, slot, spec, use } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

// A spec id sits under your plugin's slug. `acme.greeter` is the namespace of
// everything this plugin registers; the registry refuses a `core:` id and an
// update only ever replaces rows under your own slug.
const greet = spec('acme.greeter:reply', { version: '1.0.0' })
	// Exactly one inlet, first. The third argument is the usage lock: this spec
	// answers one event, for one genre, and that is what the manifest lists.
	// A genre is passed by value: yours, imported, or another package's by `use()`.
	.inlet('input', C.userMessage.v1(), {
		genre: use('core:genre/chat'),
		event: sessionEvents.messageRespond,
	})
	// A query reads Serene Pub's own data and cannot reach the network.
	.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
	// A task is pure: it turns what was read into the context the oracle takes.
	.task('prompt', () => C.assemble.v2())
	// The oracle is the one node that crosses the boundary. Which service
	// answers is a slot: an admin's choice, never the document's.
	.oracle('generate', ($) =>
		C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
	)
	// The outlet opens the run's reply row — its live row. Core emits
	// `message-created` for you.
	.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

export default greet.build()
```

Press Run. The **Result** tab shows each node in order and its outcome; **Document** is what
the packager will emit; **Graph** is the same document drawn.

Try breaking it: wire `$.input.text` straight into the oracle's `context` port. The spec
does not [publish], and the error names the port that produced the value and the port that
could not take it. That check runs when the spec is published, not at two in the morning.

## Your own node definition

The core catalog gives you queries, tasks, oracles and outlets. A plugin adds its own by
declaring a **node definition** and the **handler** behind it.

```playground ts
import { describeTaskDefinition, ok, pin, sessionEvents, spec, S, use } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import type { Example } from '@serene-pub/cli'
import { bindings, world } from '../helpers.js'

// The definition: what goes in, what comes out, and how long it may take. It
// is data. The registry stores it, the config form is rendered from it, and
// this site's option tables are rendered from declarations exactly like it.
const roll = pin(
	describeTaskDefinition({
		id: 'acme.dice:roll@1',
		i18n: { name: { en: 'Roll dice' } },
		timeoutMs: 200,
		declaresRandomness: true,
		ports: {
			in: { notation: S.text },
			out: { main: S.text },
		},
	}),
)

// The handler: the code behind the definition. In a plugin it is registered
// with `handler(roll, fn)` inside `defineExtension`. Here it is handed to the
// run directly, because the playground has no install step.
const rollHandler = async (input: { notation: string }, ctx: { random(): number }) =>
	ok({ main: `You rolled ${Math.floor(ctx.random() * 20) + 1} (${input.notation}).` })

const diceTurn = spec('acme.dice:roll-turn', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), {
		genre: use('core:genre/chat'),
		event: sessionEvents.messageRespond,
	})
	.task('roll', roll.v1({ notation: '1d20' }))
	.outlet('save', ($) => C.createMessage.v1({ text: $.roll.main }))

export const example: Example = {
	slug: 'guide-dice',
	title: 'A task of your own',
	summary: 'One custom task definition, its handler, and the outlet that writes its text.',
	build: () => diceTurn.build(),
	run: (ctx) =>
		ctx.run({
			input: { text: 'roll for initiative', sessionScope: 'session:1' },
			bindings: { ...bindings(), 'acme.dice:roll@1': rollHandler },
			world,
			subscribers: { 'core:event/message-created@1': 1 },
		}),
}
```

Two things to see here. `declaresRandomness: true` is not decoration: a handler that reads
`ctx.random()` without declaring it is a lint error, because the run seed is what makes a
receipt reproducible. And the handler returns `ok({...})` keyed by port name; a thrown
error or a bare value is not a result.

A label (`i18n.name` here, and every other string a person reads on a
[declaration]) may be a plain string or a `{ en, … }` [locale map]. `'Roll dice'` is the
same value as `{ en: 'Roll dice' }`, and a map answers each language it carries with `en` as
the fallback. Publishing refuses a blank one, or a map with no `en`, naming the field.

## Declaring the plugin

This is the file the packager reads. Every value in it is a literal, because the packager
reads your code without running it: a handler registered inside a loop, or a settings object
assembled from a variable, is a lint error rather than a silent omission.

<!-- prelude:
import type { HandlerDecl, SpecBuilder } from '@serene-pub/sdk'
declare const roll: Parameters<typeof handler>[0]
declare const rollHandler: HandlerDecl['handler']
declare const diceTurn: SpecBuilder<any>
-->
```ts
import { defineExtension, defineSettings, handler } from '@serene-pub/sdk'

const settings = defineSettings({
	notation: { type: 'string', default: '1d20', scope: 'user', label: 'Default roll' },
})

export default defineExtension({
	slug: 'acme.dice',
	name: 'Dice',
	version: '1.0.0',
	description: 'Roll dice in a session and let the model narrate the result.',
	engines: { 'serene-pub': '>=0.7 <0.8' },
	settings,
	handlers: [handler(roll, rollHandler)],
	pipelines: [diceTurn.build()],
})
```

`scope: 'user'` makes `notation` each person's own. An administrator sets the value everyone
gets, and anyone can change it for themselves in their own settings. Your handler reads it as
`input.settings.notation`, and when your code runs for someone it gets their value, then the
administrator's, then the `default`. A field without `scope` is the instance's, and only an
administrator can change it.

`engines` names the Serene Pub range, separately from the SDK range — version ranges and
nothing else. A [template engine] your plugin ships is declared under `templateEngines` instead,
as `{ '<slug>:template/<name>@1': renderFn }`; the packager writes it to the manifest as
`templateEngines`, and the function renders in the [sandbox]. The plugin's
[slug] is the namespace every id above sits under. A node definition registered under someone
else's slug is refused at `defineExtension`, while you are typing, rather than at install.

A node definition is **private** to your package unless its handler says otherwise:
`handler(roll, rollHandler, { visibility: 'public' })` lets any package's spec, or one a
person makes, use it. A node definition you offer as a swap must be public, because a swap runs
it in another package's spec. Private is the default, and it is enforced when a spec is
installed, saved and run, so a node definition you may still change is never something another
package builds on. The node definition itself never says `public`; the build refuses it and
points here.

A plugin's code never touches a [connection] or calls a model: that is core's. So a node that
uses a connection (a model call) accepts only core's stand-ins as swaps. Shape it with your own
prompts or a [config] instead of offering a replacement.

## A turn strategy of your own

A turn strategy decides who speaks next. Its ports take the [turn candidates][turn candidate]
and the [messages][message] (`S.turnCandidates`, `S.messages`) and give the prepared entries of
the turn order (`main` and `order`, both `S.turnEntries`). Core's default is round robin
(`core:task/turn-round-robin@1`), and it is the pin. Everyone who has not spoken since the
person last did goes, in the order they came in. When everyone has spoken the turn order is empty,
and it is the person's turn. A turn strategy with the same ports can be a swap for it.

Most turn strategies only change who goes first and fall back to round robin for everyone else.
Import that fallback rather than writing your own, so your plugin can't drift from core's rule:

```ts
import { roundRobinOrder, countedTurns, spokenRefsSince } from '@serene-pub/sdk'
import type { TurnCandidateV1, TurnEntryV1, TurnHistoryMessage } from '@serene-pub/sdk'

const order = (candidates: TurnCandidateV1[], messages: TurnHistoryMessage[]): TurnEntryV1[] => {
	const rest = roundRobinOrder(candidates, messages) // exactly core's rule
	// …move someone to the front, then `...rest.filter((e) => e.ref !== first.ref)`
	return rest
}
```

`countedTurns` is the history the rule counts: it leaves out hidden rows and narration.
`spokenRefsSince` is the set of references that have already had their turn this round. All
three are 🚧 `@experimental` while the turn-order words settle.

## Keys and other secrets

A setting of type `secret` (an API key, a token) is typed in by an admin, stored encrypted, and
never shown back. Your code never holds its value. Your handler's `input.settings.apiKey` is a
**handle**, a string like `⟦secret:apiKey:4f1c…⟧` that means nothing on its own and cannot be
forged. Put it where the key belongs in a request, and `ctx.fetch` fills in the real value on the
way out:

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
declare const ctx: Required<PluginHandlerContext>
declare const input: { settings: { apiKey: string } }
-->
```ts
const res = await ctx.fetch('https://api.example.com/v1/roll', {
	headers: { authorization: `Bearer ${input.settings.apiKey}` },
})
```

- It is filled in only for the hosts your manifest declares, never in a URL's host or user part,
  and URL-encoded when it lands in a URL.
- If a response or an error would quote the key, you get the handle instead.
- Anything your code returns, throws, logs or stores is scrubbed of the value and of the handle,
  so a key never reaches a node, an event, a log or a run's receipt.
- A secret shorter than four characters is refused when it is typed in: it would be too short to
  scrub.

When one of your public node definitions runs in a spec **another package owns, or one a
person made**, your secrets stay behind: a handle for one of them is refused. Lend one
deliberately with `lend: true` on the setting (`{ type: 'secret', lend: true }`) when your node
definition is meant to spend your key for others.

## Package and check

```bash
npx serene-pub check .     # what core would refuse, and the permissions this code requests
npx serene-pub build .     # dist/plugin/: manifest.json plus one document per spec
```

`check` prints the permissions the packager found in your code: network, storage, the
events you listen to. If it lists one you did not expect, the code asked for it. `build`
writes the manifest and the compiled documents; that folder is what an administrator
installs. Serene Pub never runs your build.

## Where to go next

- [Where values come from](where-values-come-from.md): which layer answers a node's params, a
  genre field, or the node definition a [session] seats.
- The [laws](/docs/sdk/laws) every host guarantees, rendered from the conformance kit.
- The [catalog](/docs/sdk/index): every core node definition, its options and defaults, and
  each shipped spec's graph.
- The [executed examples](/docs/sdk/examples/echo-reply): each one runs on every SDK build
  and its output is checked against a [golden].
- `npx serene-pub ui .` draws the UI your plugin announces, in the same opaque-origin
  [sandbox] the app mounts it in.

[run]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline
[turn]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#4-pipeline
[publish]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#5-catalog
[declaration]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#5-catalog
[slug]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#5-catalog
[config]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#6-config
[message]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session
[session]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session
[turn candidate]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session
[locale map]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session
[connection]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#10-connections
[manifest]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#12-extensions
[permission]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#12-extensions
[sandbox]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#12-extensions
[template engine]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#15-templates-and-assembly
[golden]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#13-measurement
[playground]: https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#27-documentation

:::warning
Plugin installation arrives in 0.7. Everything above builds and runs today; installing it
is what the 0.7 pre-releases add.
:::
