# `@serene-pub/core-catalog`

Core's announcement: the genres, pipelines, hook declarations, prompts and core
components Serene Pub ships, as a package. Serene Pub seeds from it at boot,
`@serene-pub/conformance` uses it as fixtures, and a plugin imports it for typed
references:

```ts
import { respond, chatGenre } from '@serene-pub/core-catalog'
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
