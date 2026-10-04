# Events

An **event** is something that happened in a session: a message was written, a member joined, the
annex changed. Core records its own. A package can declare its own too, record them from its
pipelines, and have other pipelines, plugins and widgets react.

Everything in the session hears an event, widgets included, so an event never carries a secret.
Keep a secret in your plugin's [storage](storage.md) instead.

## Declaring one

[Twenty Questions](https://github.com/SerenePub/serene-pub-plugin-twenty-questions) records an
event each time the player guesses:

```ts
import { defineSessionEvent, S } from '@serene-pub/sdk'

export const guessed = defineSessionEvent<{ guessText: string; isCorrect: boolean }>({
	id: 'showcase.twenty-questions:event/guessed@1',
	payload: S.json,
	name: { en: 'Guess made' },
	description: { en: 'The player named a guess and it was judged.' },
})
```

- **`id`** is `<your slug>:event/<name>@<version>`. `core:` is core's.
- **`payload`** is one of core's shapes (`S.json`, `S.text`, …). Shapes of your own are not
  supported yet, so use `S.json` and check the payload in whatever listens.
- A new payload is a new version: `guessed@2`, declared beside `@1`.

## Saying who may record it

In `defineExtension`, say which pipelines may record the event. You name them by what they
serve (their **subject**: an event, or an action), per genre.

<!-- prelude:
import { defineExtension, type GenreDecl, type SessionEventDecl, type SpecRef } from '@serene-pub/sdk'
declare const guessed: SessionEventDecl<{ guessText: string; isCorrect: boolean }>
declare const twentyQuestionsGenre: GenreDecl
declare const judgeGuess: SpecRef
-->
```ts
defineExtension({
	slug: 'showcase.twenty-questions',
	name: 'Twenty Questions',
	version: '1.0.0',
	// …
	events: [
		{
			event: guessed,
			genre: twentyQuestionsGenre,
			recordedBy: [{ spec: judgeGuess, key: 'submit-guess' }],
		},
	],
})
```

`recordedBy` lists subjects: core events (`sessionEvents.messageRespond`), actions
(`{ spec, key }`), or a spec value, which stands for everything that spec serves. `'any'` lets
any pipeline in the genre record it. The permission follows the subject, not the pipeline: a
pipeline somebody swaps in to serve *Submit guess* may record `guessed` too.

The same event may be declared for several genres, once each. An event you declare but never list
here is refused at build, because nothing could record it.

## Recording it

A pipeline records an event with one write step, `record-event`:

<!-- prelude:
import { S, type SessionEventDecl, type SpecBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
declare const guessed: SessionEventDecl<{ guessText: string; isCorrect: boolean }>
declare const chain: SpecBuilder<{ verdict: { main: typeof S.json } }>
chain
-->
```ts
.outlet('guessed', ($) => C.recordEvent.v1({ event: guessed, payload: $.verdict.main }))
```

The event is the declaration itself, never a wired value, so anyone can see what a pipeline
records without running it. The payload is checked against the declared shape when the pipeline is
published, and checked again when the step runs: it must be plain JSON and at most 64 KiB.

The host refuses a recording from a pipeline outside the scope, at publish and at the write. So
does a recording of an event no installed package declares, including one whose package was
uninstalled.

## Hearing it

Everything in the session hears a recorded event.

- **A pipeline**: lock its inlet on the event, and bind it like any other event pipeline.

  <!-- prelude:
  import { type GenreDecl, type SessionEventDecl, type SpecBuilder } from '@serene-pub/sdk'
  import * as C from '@serene-pub/contracts'
  declare const guessed: SessionEventDecl<{ guessText: string; isCorrect: boolean }>
  declare const twentyQuestionsGenre: GenreDecl
  declare const chain: SpecBuilder<{}>
  chain
  -->
  ```ts
  .inlet('event', C.sessionEvent.v1(), { genre: twentyQuestionsGenre, events: [guessed] })
  ```

  The inlet's `payload` is the envelope `core:shape/recorded-event@1`: `event`, `sessionId`, `at`,
  `cause`, and what was recorded, on `payload`.
- **A plugin**: `eventListener(guessed, (e, ctx) => …)` in `handlers`.
- **A widget**: `ctx.onEvent((e) => …)` hears `{ kind: 'event:recorded', event, payload, at }`.
  Check `e.kind === 'event:recorded' && e.event === guessed.id`, and read the value on
  `e.payload`.

## Loops

A pipeline that hears an event can record another, and so can the pipeline that hears that one.
One tree of runs caused this way may go **four runs deep** and hold **sixteen runs** in all.
Nothing refuses a cycle at build. At a limit, the next run waits for the session owner, who sees
the chain by pipeline name and chooses **Continue** (four more levels and sixteen more runs) or
**Stop here**. Nothing runs past a limit unasked.

## Rules

- An event carries no secret: everything in the session hears it, widgets included. A value only
  your pipelines may read goes in an annex field with an empty `see`; a secret the player must
  never see, or anything like a credential, goes in your plugin's [storage](storage.md).
- Only a write records an event. No node declares that it emits one.
- A recording is refused outside its scope, and refused for an undeclared event.
