# Storage

A plugin can keep two kinds of data, and they answer different needs:

- **Files**: your plugin's own files. Only your own code reads them, so this is where hidden
  state lives: an opponent's fleet, the answer the player must guess.
- **Annex fields**: small values kept in the session itself, which your widgets can save and
  read back and which the people in the session may see: the last roll, a note, a toggle.

## Your plugin's own files

Ask for a quota in your plugin's declaration. An admin reviews the request, and the pub may
lower it.

<!-- prelude:
import { defineExtension } from '@serene-pub/sdk'
-->
```ts
export default defineExtension({
	slug: 'showcase.battleship',
	name: 'Battleship',
	version: '1.0.0',
	// ...
	permissions: { storage: { quotaBytes: 4 * 1024 * 1024 } },
})
```

Your files are reachable from exactly one place: **your own handlers, running in your plugin's
sandbox.** No core step reads them, no widget or frame sees them, and no message carries them
unless a handler puts one there.

### Which handlers get storage

`ctx.storage` is handed to your queries, oracles, outlets, event listeners and lifecycle
callbacks. A **task** never gets it: a task is pure. So a step that reads your files is a
**query**, a step that writes them is an **outlet** (declared `effects: 'emit'`, and it may sit
anywhere in a pipeline), and a step that touches neither is a task. Declaring a storage step as
a task is the mistake everyone makes once; `serene-pub check` catches it. The full table is in
[What a plugin may do](plugin-permissions.md).

Your handler cannot read Serene Pub's own tables. Anything from the session (the cast, the
history, the lorebook) arrives on your step's **input ports**, wired from one of core's queries
upstream.

### Keeping state per session

Your files belong to your plugin, not to a session. Put the session id in the path:

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
type Fleet = { ships: { cells: number[] }[] }
declare function placeFleet(random: () => number): Fleet
-->
```ts
import { err, ok } from '@serene-pub/sdk'

const path = (sessionId: number, part: string) => `sessions/${sessionId}/${part}.json`

// Inside a handler, which is (input, ctx); `sessionId` arrives on an input port.
async function aiFleet(sessionId: number, ctx: PluginHandlerContext) {
	if (!ctx.storage) return err('storage: not granted to this node kind')
	const stored = await ctx.storage.files.read(path(sessionId, 'ai-fleet')) // err until written
	if (stored.kind === 'ok') return ok(JSON.parse(new TextDecoder().decode(stored.value)) as Fleet)
	const fleet = placeFleet(ctx.random)
	const wrote = await ctx.storage.files.write(
		path(sessionId, 'ai-fleet'),
		new TextEncoder().encode(JSON.stringify(fleet)),
	)
	if (wrote.kind === 'err') return wrote // e.g. 'storage: quota exceeded'
	return ok(fleet)
}
```

`ctx.storage` is typed optional because a kind that is not granted it has no `storage` at all.

| `ctx.storage.files` | |
| --- | --- |
| `read(path)`, `write(path, bytes)`, `delete(path)` | one file |
| `list(prefix?)`, `stat(path)` | what is there, and how big |
| `deleteAll(prefix?)` | everything under a prefix |

A path is relative to your plugin's own directory, and one that climbs out of it (`..`) is
refused. `usage()` tells you how much of the quota your files use. To keep a value, write it as
JSON bytes, as above.

**A full quota does not throw.** `files.write`, `files.delete` and `files.deleteAll` return a
result: `ok` with the bytes it changed and the usage now, or `err` with the reason, and nothing
half-written. Your handler can pass the sentence on, or prune and retry.

**Give hidden state a lifetime.** Battleship shows the opponent's fleet on the board when the
last ship goes down, and deletes its file (`ctx.storage.files.delete(path(sessionId, 'ai-fleet'))`).
A secret that outlives its game is a leak waiting to happen. Clean up the rest in an `uninstall`
[lifecycle callback](extending.md#event-listeners-and-lifecycle-callbacks).

**What a session should keep belongs in its annex.** A file is yours alone: core cannot see
inside it, so nothing shows it, checks it or takes it back when a person presses Back. A value
the session keeps, and that should go back with the turn that wrote it, is an
[annex field](#a-value-a-widget-saves-annex-fields). One nobody may see (`see: []`) is hidden
state your pipelines keep in the session.

### Never on a channel

Anything written to a message, on any channel, reaches the people in the session. So the rule for
something the player must not see is not "keep it out of the widget": it is **never write it to
a message at all**. Battleship's board is drawn from messages; the opponent's fleet is a file in
its storage, and nothing draws it. See [Channels](channels.md).

## A value a widget saves: annex fields

*Experimental.* A value your **widget** saves and reads back belongs in the session's
**annex**, and you do not need a pipeline for each one. Declare an **annex field**: its key, the
shape its value must have, who may see it (`see`) and who may set it (`act`).

<!-- prelude:
import type { ComponentContext } from '@serene-pub/component-client'
-->
```ts
import { annexField, annexFieldAction, defineExtension } from '@serene-pub/sdk'

export default defineExtension({
	slug: 'acme.dice',
	name: 'Dice',
	version: '1.0.0',
	annexFields: [
		annexField({
			key: 'last-roll',
			shape: { type: 'integer', min: 1, max: 20 },
			see: ['person'],
			act: ['participant'],
		}),
	],
})

// In the widget: set it, then read it back from the viewer's annex.
export function saveRoll(ctx: ComponentContext, roll: number) {
	ctx.invoke(annexFieldAction('acme.dice', 'last-roll'), { payload: { value: roll } })
}
export const lastRoll = (ctx: ComponentContext) =>
	ctx.annex?.['acme.dice']?.['last-roll'] as number | undefined
```

- **`see`** says who may read the value: `person` (every human in the session), `ai` (the model's
  prompt), `participant` (both), `owner`, `admin`, or one character (`character:12`). Empty means
  only your pipelines.
- **`act`** says who may set it from a widget. A field with `act` gets one action, which your
  widget presses with `annexFieldAction(slug, key)`, and core writes the value. A field without
  `act` is written only by your pipelines, with core's `set-session-annex` step.
- **`genre`** limits the field to one genre's sessions: `annexField({ …, genre: myGenre })`.

Your `annexFields` list is the whole of your package's annex: a `set-session-annex` step of yours
may write only keys declared there, and every value is checked against its shape when it is
written. A press is refused, with a sentence, for an undeclared key, a value the shape refuses,
and a person outside `act`.

The annex is session state that people see. Never put credentials or personal data in it: a
shape with a `secret` anywhere in it is refused when you declare it.

## The three storages

Where a session's data lives:

| storage | a pipeline reads it with | a pipeline writes it with | core types | you own |
|---|---|---|---|---|
| Annex | `session-annex@1` | `set-session-annex@1` · `set-annex-field@1` | owner namespacing, audiences, the annex field declaration | the owner document's value |
| Messages | `session-history@1` · `history-attachments@1` · `vector-search@1` | `create-message@1` · `update-message@1` · `hide-message@1` · `record-event@1` | the row, core's metadata keys, events, the anchor | a part's `data`, a recorded event's payload |
| Lorebook | `lorebook-entries@1` · `world-lore@1` · `session-cast@1` | `create-lore-entry@1` · `update-lore-entry@1` · `link-lore-entries@1` · `graph-proposal@1` | the entry type, links, cast member, scene, provenance, anchor | `content`, and `fields` as the entry type declares them |

Core types the envelope and the identity; the author owns the value.

## Testing against the real sandbox

The SDK's harness hands a handler the same `ctx` the sandbox would, so a test fails the way an
install would:

<!-- prelude:
import type { Bindings, Result } from '@serene-pub/sdk'
declare const fleet: unknown
declare const input: unknown
declare function seedBoards(input: unknown, ctx: import('@serene-pub/sdk/testing').PluginHandlerContext): Promise<Result>
declare function bindings(): Bindings
declare const handlers: Parameters<typeof pluginNodeBindings>[0]['handlers']
-->
```ts
import { memoryStorage, pluginHandlerContext, pluginNodeBindings } from '@serene-pub/sdk/testing'

const storage = memoryStorage({ quotaBytes: 64 * 1024 })
// A game already in progress: write its file first.
await storage.files.write('sessions/1/ai-fleet.json', new TextEncoder().encode(JSON.stringify(fleet)))

// One handler, one context, exactly the members its kind is granted.
const ctx = pluginHandlerContext({ pluginId: 'showcase.battleship', kind: 'outlet', storage })
await seedBoards(input, ctx)

// Or bind every handler for a run of a whole pipeline on the fixture host. `handlers` maps
// 'definitionId@version' to its (input, ctx) handler; every handler shares `storage`.
// `bindings()` is the core fixtures in your scaffold's `examples/fixtures.ts`.
const all = { ...bindings(), ...pluginNodeBindings({ pluginId: 'showcase.battleship', storage, handlers }) }
```

`memoryStorage` behaves like the app's storage: the same quota, the same refusal sentence
(`storage: quota exceeded`), and each plugin kept apart from the others. It adds one test aid:
`writes` (how many times `files.write` was called). Its other option is `now` (the clock that
stamps `updatedAt`).
