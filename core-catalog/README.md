# `@serene-pub/core-catalog`

Core's announcement: the genres, pipelines, hook declarations, prompts and core
components Serene Pub ships, as a package. Serene Pub seeds from it at boot,
`@serene-pub/conformance` uses it as fixtures, and a plugin imports it for typed
references:

```ts
import { chatGenre, chatTurnOrder } from '@serene-pub/core-catalog'
```

Core is the first consumer of the announce path rather than a special case — one
validator, one document shape and one hash discipline for core and plugins alike.

| entry                                                                                                           | what it is                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@serene-pub/core-catalog`                                                                                      | the announcement: genres, specs, hooks, prompts, the default preset                                          |
| `@serene-pub/core-catalog/widgets`, `/core-widgets`                                                             | the session widget context and core's widget declarations                                                    |
| `@serene-pub/core-catalog/conversation`, `/session-state`, `/lore-entries`, `/authors-note`, `/scene-portraits` | the core components' typed sections                                                                          |
| `@serene-pub/core-catalog/components/*`                                                                         | each core component built, with its source beside it (`<slug>.source.json`) — what `serene-pub clone` copies |

`components/` holds the core components' Svelte source. It ships so a host's
stylesheet build can scan it for class names; it is not imported at runtime.

Importing the package registers its declarations, so it lists those modules in
`sideEffects` — a bundler must not drop them.

## Where things live

`src/` is laid out by genre (ruled 2026-10-05):

| folder                | holds                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/genres/<genre>/` | one genre's pipelines, one spec per file (create, reply, actions, answer form, turn order), and its own widgets (`genres/chat/ui/authors-note/`)                                    |
| `src/shared/`         | what more than one genre uses: the built-in message verbs, summarize, the annex field, sprites, the story graph build, the tool-loop example, and the shared widgets (`shared/ui/`) |
| `src/factories/`      | `answerFormSpec()` and `turnOrderSpec()`, which a plugin genre calls too                                                                                                            |
| `src/registry/`       | genres, slots, stat shapes, entry types, widget declarations and layouts                                                                                                            |
| `src/seed/`           | the shipped prompts, presets and the guide mascot                                                                                                                                   |
| `components/`         | the Svelte sources, mirrored the same way (`components/shared/*`, `components/genres/chat/authors-note`)                                                                            |

`CORE_SPECS` (`src/index.ts`) lists every pipeline core seeds, with its display name. A genre's
pipeline id is `core:spec/<genre>-<what>` (`core:spec/chat-respond`); one every genre uses is
`core:spec/<what>` (`core:spec/summarize-scene`). A name says what the pipeline does and never
which genre it serves (_Reply_, _Turn order_): wherever several genres' pipelines are listed, the
genre is shown beside it. `core:spec/tool-loop` is exported as an example and is not in
`CORE_SPECS`.
