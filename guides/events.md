# Events

An **event** is something that happened in a session: a message was written, a member joined, the
annex changed. Core records its own. A package can declare its own too, record them from its
pipelines, and have other pipelines, plugins and widgets react.

An event is always a **happening**. Everything in the session hears it, so it never carries a
secret. Keep a secret in state instead.

## Declaring one

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
- **`payload`** is a core shape (`S.json`, `S.text`, …). A shape of your own cannot travel to an
  installed instance yet, so use `S.json` and check the payload in whatever listens.
- A new payload is a new version: `guessed@2`, declared beside `@1`.

## Saying who may record it

Recording is scoped in the package entry: which **subjects** a pipeline must serve to record the
event, per genre.

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

`recordedBy` lists subjects: core events (`sessionEvents.messageRespond`), action picks
(`{ spec, key }`), or a spec value, which stands for every subject it serves. `'any'` lets any
pipeline in the genre record it. The scope follows the subject, not the pipeline: a pipeline
somebody swaps in to serve Submit guess may record `guessed` too.

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

The event is the declaration value, never a wired input, so every tool can see what a pipeline
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
- **A widget**: `ctx.on('event:recorded', (e) => { if (e.event === guessed.id) … })`, with the
  recorded value on `e.payload`.

## Loops

A pipeline that hears an event can record another, and so can the pipeline that hears that one. A
tree of runs caused this way is held to two caps: four dispatches deep, and sixteen runs in all.
There is no build-time refusal of a cycle. At a cap, the next run waits for the session owner, who
sees the chain by pipeline name and chooses **Continue** (one more window of each cap) or **Stop
here**. Nothing runs past a cap unasked.

## Rules

- An event carries no secret: everything in the session hears it, widgets included. Keep a secret
  in the session annex, under a key your annex declaration gives no `see` (pipelines only), or a
  `see` naming who may know it (`['character:12']`, `['owner']`). A prompt reads the annex with
  `view: 'ai'` and the speaker, and gets only what the model may carry. Every widget on a
  person's screen, from any package, sees what that person may see: the annex is session
  state, never credentials or personal data — keep those in your plugin's own storage.
- Only a write records an event. No node declares that it emits one.
- A recording is refused outside its scope, and refused for an undeclared event.
