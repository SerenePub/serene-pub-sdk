# What a plugin can do

A plugin is one `defineExtension({ … })` call. Every part it adds is one field of that call.
This page is the map: what each part is for, what it may and may not do, and a small example.
Each section links to the guide with the details.

## At a glance

| You want to… | The part | Where you declare it | Details |
| --- | --- | --- | --- |
| Add a step a pipeline can run: roll dice, keep score, call a web API | a **node definition** and its **handler** | `handlers` | [Node kinds](#node-kinds-what-each-step-may-do) |
| Decide what happens when something happens in a session | a **pipeline** (a spec) | `pipelines` | [Pipelines](#pipelines) |
| Add a new kind of session: a game, a writing room | a **genre** | `genres` | [Genres](#genres) |
| Add a button, a menu item or a slash command | an **action** | on a spec, `contributes.actions` | [Actions](#actions) |
| Ask a question inside a message | a **choices** or **form** block | a step in a pipeline | [Forms](forms-and-effects.md) |
| Show your own interface in the session | a **widget** and its **component** | `widgets`, `components` | [Widgets](widgets.md) |
| Show a whole HTML document: a page, a charting library | a **frame** | `surfaces`, or an `sp-frame` inside a widget's component | [Frames](frames.md) |
| Tell the rest of the session that something happened | a **session event** | `events` | [Events](events.md) |
| Run code when an event happens, or when your plugin is installed or switched on | an **event listener**, a **lifecycle callback** | `handlers` | [Listeners](#event-listeners-and-lifecycle-callbacks) |
| Keep data between runs | **storage**: your own rows and files | `permissions.storage` | [Storage](storage.md) |
| Let a widget save a small value in the session | an **annex field** | `annexFields` | [Storage](storage.md#a-value-a-widget-saves-annex-fields) |
| Let an admin, or each person, configure your plugin | **settings** | `settings` | [Your first plugin](your-first-plugin.md#declaring-the-plugin) |
| Offer a different rule for who speaks next | a **turn strategy**, offered as a **swap** | `handlers`, `swaps` | [Your first plugin](your-first-plugin.md#a-turn-strategy-of-your-own) |

Every name on this page is defined in the [vocabulary](vocabulary.md).

## What a plugin cannot do

These limits hold whatever you declare. Plan around them from the start.

- **It never calls a model or reads a connection.** Model calls are core's steps
  (`generate-text` and the like). Your pipeline places them, and an admin decides which model
  answers. You shape the call with your own prompts and settings.
- **It never writes Serene Pub's data from code.** Messages, the session annex, lore entries and
  events are written by core's write steps, which your pipeline places. Your own code writes only
  your own storage.
- **It never reads Serene Pub's tables from code.** Session data (the history, the cast, the
  lorebook) reaches your step on its input ports, wired from one of core's read steps upstream.
- **It never starts a pipeline from code.** A pipeline starts when an event happens or a person
  presses an action. To cause one, a pipeline records an event with core's `record-event` step.
- **Widgets and frames have no network and no storage.** They draw what the session sends them,
  and they press actions. Anything else goes through your pipelines.

## Pipelines

A **pipeline** is a graph of steps that runs when something happens in a session: a message
arrives, a button is pressed, an event is recorded. You build one with `spec()` and ship it under
`pipelines`. Serene Pub installs the compiled document, never your builder code.

<!-- prelude:
import { sessionEvents, slot, spec, use } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
-->
```ts
const reply = spec('acme.greeter:reply', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: use('core:genre/chat'), event: sessionEvents.messageRespond })
	.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
	.task('prompt', () => C.assemble.v2())
	.oracle('generate', ($) => C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }))
	.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))
```

[Your first plugin](your-first-plugin.md) builds this one step by step and runs it in the page.
The [catalog](/docs/sdk/index) lists every core step you can place, with its options.

## Node kinds: what each step may do

Every step in a pipeline is a **node**, and every node has one of five **kinds**. The kind says
what the step is allowed to do. Your own node definitions can be any kind but the inlet.

| Kind | Its job | What your handler is handed, beyond `random`, `now`, `log` and `signal` | A core example |
| --- | --- | --- | --- |
| **inlet** | Where a run starts. Exactly one per pipeline, first. It ties the pipeline to one genre and one event. | Only core ships inlets. You place one of core's. | `user-message`, `session-event` |
| **query** | Reads. | `storage`: your plugin's own rows and files. | `session-history` |
| **task** | Computes. Data in, data out, nothing else. | Nothing more. A task gets no storage and no network. | `assemble` |
| **oracle** | Calls out to something outside the run. | `storage`, and `fetch` for the hosts your plugin declares. | `generate-text` |
| **outlet** | Writes. | `storage`. A plugin's outlet declares `effects: 'emit'`: it writes your own storage and passes values on, and core's outlets do the writing to the session. | `create-message`, `set-session-annex`, `record-event` |

A handler takes `(input, ctx)` and returns `ok({ <port>: value })`, or `err('a sentence')`. A
thrown error or a bare value is not a result. Declaring the wrong kind is the mistake everyone
makes once: a task that reads `ctx.storage` finds nothing there. `serene-pub check` catches it
before you install.

A small query of your own, reading a row your plugin wrote earlier:

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
-->
```ts
import { describeQueryDefinition, handler, ok, pin, S } from '@serene-pub/sdk'

const lastRoll = pin(
	describeQueryDefinition({
		id: 'acme.dice:query/last-roll@1',
		i18n: { name: 'Last roll' },
		timeoutMs: 500,
		ports: { in: { sessionId: S.rowIds }, out: { main: S.text } },
	}),
)

export const lastRollHandler = handler(lastRoll, async (input: { sessionId: unknown }, ctx: PluginHandlerContext) => {
	const text = await ctx.storage?.get<string>(`s:${input.sessionId}:last-roll`)
	return ok({ main: text ?? 'No roll yet.' })
})
```

The exact `ctx` each kind is handed, and the rules every kind shares, are in
[What a plugin may do](plugin-permissions.md).

## Genres

A **genre** is a kind of session: Chat, Adventure, Guide and the Lair are core's. A plugin genre says how
many characters a session needs, whether it has a composer, which channels it has, which widgets
it leaves out and how its screen is laid out. It owns the pipelines its sessions run.

```ts
import { genre } from '@serene-pub/sdk'

export const duel = genre('acme.duel:genre/duel', {
	name: 'Duel',
	family: 'game',
	shape: { characters: { min: 1, max: 1 }, composer: 'text' },
})
```

A genre ships with a pipeline that creates its sessions, one that answers each turn, and a
**preset**: which pipelines a new session of the genre runs. Four plugins show the whole thing,
and each one builds and tests on its own:

- [Twenty Questions](https://github.com/SerenePub/serene-pub-plugin-twenty-questions): the smallest
  complete genre. Its own event, three widgets, an annex field, no storage.
- [Writing Room](https://github.com/SerenePub/serene-pub-plugin-writing-room): two
  [channels](channels.md) that play different parts in a prompt, built from core's steps alone.
- [Whodunit](https://github.com/SerenePub/serene-pub-plugin-whodunit): suspects who each know only
  their own part, and a verdict decided by a comparison rather than by a model.
- [Battleship](https://github.com/SerenePub/serene-pub-plugin-battleship): hidden state in the
  plugin's own storage, a board widget that stands in for the conversation, and a `page` frame.

## Actions

An **action** is anything a person can press: a composer button, a message-menu item, a slash
command, a button in your widget. It is declared on the pipeline that answers it. It says where
it appears (its **venue**) and, in one plain sentence, what it does.

<!-- prelude:
import { sessionEvents, spec, use } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
-->
```ts
const roll = spec('acme.dice:spec/roll', {
	version: '1.0.0',
	contributes: {
		actions: [
			{
				key: 'roll',
				venue: { kind: 'composer' },
				label: 'Roll',
				description: 'Roll the dice and post the result.',
				slash: 'acme.dice.roll',
			},
		],
	},
}).inlet('input', C.userMessage.v1(), { genre: use('core:genre/chat'), event: sessionEvents.sessionAction })
```

The venues drawn today are `composer`, `message` (a message's menu), `extra` (the turn controls
beside the composer), `widget` (your widget's own buttons) and `form` (a button in a form block).
An action that changes something outside the story, such as a lore entry, may only appear where
the session owner presses it. See [Forms, and the effects line](forms-and-effects.md).

## Widgets and frames

Your interface in a session is a **widget**: a box a person places in their session layout.
There are two ways to draw one.

- **A component** is the usual way: Svelte or plain DOM code that runs in the page's worker and
  places plain HTML and the app's own `sp-*` elements, so it looks like the rest of the app. See
  [Widgets](widgets.md).
- **A frame** is a whole HTML document in a sandboxed iframe, for the one region that needs a
  real DOM: a charting library, a rich-text editor. A frame can also be a standalone page outside
  any session. See [Frames](frames.md).

```ts
import { component, widget } from '@serene-pub/sdk'

export const tally = widget({ id: 'tally', title: 'Tally', component: 'tally' })
export const tallyComponent = component({ slug: 'tally', label: 'Tally', entry: 'components/tally.ts', framework: 'svelte' })
```

Neither one has network access or storage. A widget reads what the session sends it (messages,
its settings, the session's annex, and any extra data an admin granted it) and presses actions.

## Events

A **session event** is something that happened, and everything in the session hears it. Core
records its own. A plugin declares its own, records them from a pipeline with core's
`record-event` step, and answers them with another pipeline, a listener or a widget.

```ts
import { defineSessionEvent, S } from '@serene-pub/sdk'

export const rolled = defineSessionEvent<{ total: number }>({
	id: 'acme.dice:event/rolled@1',
	payload: S.json,
	name: 'Dice rolled',
	description: 'Someone rolled the dice.',
})
```

An event never carries a secret, because everyone in the session hears it. See
[Events](events.md).

## Event listeners and lifecycle callbacks

Not all of your code is a step in a pipeline. Two other kinds of handler go in `handlers`:

- An **event listener** runs when an event happens: one of core's, or one a package declared.
  It is told what happened and may use your storage. It returns `ok({})`, or `err(…)` to record a
  failure; nothing else reads what it returns.
- A **lifecycle callback** runs at a moment in your plugin's life: `startup`, `enable`,
  `disable`, `update` (the first run after a new version is installed), `uninstall` (your last
  chance to clean up) and `shutdown`. It may use your storage.

<!-- prelude:
import type { SessionEventDecl } from '@serene-pub/sdk'
declare const rolled: SessionEventDecl<{ total: number }>
-->
```ts
import { eventListener, lifecycleCallback, ok } from '@serene-pub/sdk'

export const handlers = [
	eventListener(rolled, async (e, ctx) => {
		await ctx.storage.put('last-total', (e.payload as { total: number }).total)
		return ok({})
	}),
	lifecycleCallback('uninstall', async (_input, ctx) => {
		await ctx.storage.deleteAll()
		return ok({})
	}),
]
```

Neither one gets the network, and neither can call a model or start a pipeline.

To run on a schedule, listen to `core:event/schedule-tick@1` (`SCHEDULED_WORK_PATH.instead`).
Serene Pub sends it once an hour, on the hour, with `{ cadence: 'hourly', scheduledFor, scope:
'pub' }`, to every enabled plugin that listens and was granted the event. For work less often
than hourly, keep the last time you ran in your storage and compare:

<!-- prelude:
import { eventListener, ok, SCHEDULED_WORK_PATH } from '@serene-pub/sdk'
-->
```ts
const nightly = eventListener(SCHEDULED_WORK_PATH.instead, async (e, ctx) => {
	const { scheduledFor } = e.payload as { scheduledFor: string }
	const day = scheduledFor.slice(0, 10)
	if ((await ctx.storage.get<string>('last-day')) === day) return ok({})
	await ctx.storage.put('last-day', day)
	return ok({})
})
```

## Storage, settings and permissions

- **Storage.** Your plugin's own rows and files, under a quota it asks for. Only your own
  queries, oracles, outlets, listeners and lifecycle callbacks reach them. Nothing else does, so
  storage is where hidden state lives: an opponent's fleet, an answer the player must guess. See
  [Storage](storage.md).
- **Annex fields.** A small value a widget can save in the session and read back, such as the
  last roll or a toggle. It is session state that people see, never a secret. See
  [Storage](storage.md#a-value-a-widget-saves-annex-fields).
- **Settings.** Fields an admin fills in, or each person fills in for themselves. A `secret`
  setting (an API key) reaches your code as a handle that only `ctx.fetch` can spend. See
  [Your first plugin](your-first-plugin.md#keys-and-other-secrets).
- **Permissions.** Storage and network are asked for, never assumed:
  `permissions: { storage: { quotaBytes }, network: { hosts: ['api.example.com'] } }`. An admin
  reviews each request and may refuse it. See [What a plugin may do](plugin-permissions.md).

## Less common parts

- **Swaps.** A node definition of yours that a person may put in place of a step in another
  package's pipeline, such as a different turn strategy. It must be public. See
  [Where values come from](where-values-come-from.md).
- **Template engines.** A template language of your own, declared under `templateEngines`. It
  renders in the sandbox, as a pure function.
- **Configs and presets.** Named settings for your pipelines, and which pipelines a session of a
  genre runs. See [Where values come from](where-values-come-from.md).

The [API reference](https://serenepub.com/docs/sdk/api/index) on the Serene Pub website lists
every export with its stability: `@public` is stable for SDK 1.0, and `@experimental` may still
change. (The help built into the app leaves the reference out, to keep the app small.)
