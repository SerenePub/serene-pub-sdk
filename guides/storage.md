# Storage

A plugin can keep its own rows and files. They live under the plugin's id, count against the
quota its manifest declares, and are reachable from exactly one place: **the plugin's own node
handlers, running inside its sandbox.** No core node reads them, no frame sees them, and no
message carries them unless a handler puts them there.

<!-- prelude:
import { defineExtension } from '@serene-pub/sdk'
-->
```ts
export default defineExtension({
	slug: 'chariot.battleship',
	name: 'Battleship',
	version: '1.0.0',
	// ...
	permissions: { storage: { quotaBytes: 4 * 1024 * 1024 } },
})
```

## Who is granted what

A handler's context depends on the **kind** of node it implements. This is the grant table the
app enforces and the SDK harness mirrors as `hookCtxGrants`:

| kind | `ctx` members |
| --- | --- |
| task | `random`, `now`, `log`, `signal` — a task is pure, and gets no storage and no network |
| query | the above plus `storage` |
| outlet, `effects: 'emit'` | the same as a query |
| oracle | the above plus `fetch`, when the manifest declares a host — the one kind that may cross the network |
| outlet, `effects: 'write'` | **not available to a plugin** — nothing in the sandbox can commit a core row |

So a node that reads rows is a **query**, a node that writes rows is an **emit-class outlet**
(which may sit mid-pipeline; the one-live-row law counts only the reply row a run opens),
a node that reaches the network is an **oracle**, and a node that touches none of these is a task. Declaring a storage-touching node as a task is the
mistake everyone makes once: at install it receives no `storage` and halts. `serene-pub check`
refuses it before that.

There is no `read`, `call` or `commit` on a plugin handler's context. A plugin query does not
read Serene Pub's tables; it reads its own rows. Anything from the session — the cast, the
history, the lorebook — arrives on the node's **input ports**, wired from a core query upstream.

## Per-session state

Rows are keyed per plugin, not per session. Compose the key from the run's session id:

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
type Fleet = { ships: { cells: number[] }[] }
declare function placeFleet(random: () => number): Fleet
-->
```ts
import { err, ok } from '@serene-pub/sdk'

const key = (sessionId: number, part: string) => `s:${sessionId}:${part}`

// Inside a handler, which is (input, ctx); `sessionId` arrives on an input port.
async function aiFleet(sessionId: number, ctx: PluginHandlerContext) {
	if (!ctx.storage) return err('storage: not granted to this node kind')
	let fleet = await ctx.storage.get<Fleet>(key(sessionId, 'ai-fleet')) // undefined until written
	if (!fleet) {
		fleet = placeFleet(ctx.random)
		const wrote = await ctx.storage.put(key(sessionId, 'ai-fleet'), fleet)
		if (wrote.kind === 'err') return wrote // e.g. 'storage: quota exceeded'
	}
	return ok(fleet)
}
```

`ctx.storage` is typed optional because a kind that is not granted it has no `storage` member at
all. The rows half is `get`, `put`, `delete`, `keys(prefix?)`, `query({ prefix, since, until,
limit, cursor, order })` and `deleteAll(prefix?)`; `usage()` answers the quota at any time, and
`files` is the same shape for bytes (`list`, `stat`, `read`, `write`, `delete`, `deleteAll`).
Rows and files count against the one quota. A value must survive JSON, since that is how it is
stored.

A write past the quota does not throw: `put` (like `delete` and `files.write`) returns a `Result`
whose `ok` value is a `WriteReceipt` (`deltaBytes` plus the current `usage`), and a refused write
comes back as `err` with the refusal as its reason and nothing partially applied. A handler can
publish that sentence, or prune and retry. A key that is empty or longer than 512 characters,
or a value JSON cannot carry, is a programming error and does throw.

Give hidden state a lifetime. Battleship publishes the opponent's fleet onto the board when the
last ship goes down and deletes the row (`ctx.storage.delete(key(sessionId, 'ai-fleet'))`); a
secret that outlives its game is a leak waiting for a records page.

## A value a widget saves: annex fields

*Experimental.* Rows are private to your handlers. A value your **widget** should save and read back —
the last roll, a note, a toggle — belongs in the session's annex instead, and you do not need a
pipeline per value for it. Declare an **annex field**: a key in your package's annex document, the
shape its value must have, who may see it (`see`, a data audience; empty is pipelines only) and
who may set it (`act`). A field with `act` is **settable**: the host lists one action for it under
the `widget` venue, and core's one pipeline (`core:spec/set-annex-field`) writes it through the same
annex write a `set-session-annex` node uses — the receipt, `annex-changed`, every viewer's view
re-sent. A field without `act` is written by your pipelines only; a press of it is refused.

Your `annexFields` list is your package's whole **annex declaration**, the single source of truth
for its annex document: every key your own `set-session-annex` steps write must be in it. A step
naming another key is refused by `defineExtension()` and `validate()` when the keys are written
out, and by the host at every write. The audience stored with a value is the field's `see`. A
value is held to its shape at every write. `annexSchemaOf('<slug>')` returns the declared shapes, and
`annexVarFieldOf('<slug>')` the same as a template variable.

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
	(ctx.annex?.['acme.dice'] as { 'last-roll'?: number } | undefined)?.['last-roll']
```

A press is refused, with a sentence, for a key your package did not declare, a value the shape
refuses (the validator's own words), a presser outside `act`, and any field while plugins are
switched off. A field for one genre's sessions only says so (`annexField({ …, genre: myGenre })`);
its owner is still your package. The annex never holds credentials or personal data: a shape with a
`secret` anywhere in it is refused when you declare it.

## What a frame sees is what the client may see

A frame subscribes to channels. So the rule for anything the player must not see is not "keep
it out of the frame", it is **never write it to a channel or a message at all**. The board is a
message on the `board` channel and the frame draws it; the opponent's fleet is a row and nothing
draws it. See [Frames](frames) and [Channels](channels).

## Testing against the real surface

The SDK harness endows a plugin handler with the sandbox's context, not the executor's, so a
test fails the way an install would:

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

// `seed` is the rows to start with, key → value: a game already in progress.
const storage = memoryStorage({ quotaBytes: 64 * 1024, seed: { 's:1:ai-fleet': fleet } })

// One handler, one context, exactly the members its kind is granted.
const ctx = pluginHandlerContext({ pluginId: 'chariot.battleship', kind: 'outlet', storage })
await seedBoards(input, ctx)

// Or bind every handler for a fixture-host run of a whole pipeline. `handlers` maps
// 'definitionId@version' to its (input, ctx) handler; every handler shares `storage`.
// `bindings()` is the core fixtures in your scaffold's `examples/fixtures.ts`.
const all = { ...bindings(), ...pluginNodeBindings({ pluginId: 'chariot.battleship', storage, handlers }) }
```

`memoryStorage` is a full `ExtensionStorage` plus two test aids: `snapshot()` (every row, key-sorted)
and `writes` (how many times `put` was called). Its other options are `rowQuotaBytes` (the row
sub-cap, derived from `quotaBytes` by default) and `now` (the clock that stamps `updatedAt`). It
refuses with the app's own sentences (`storage: the row budget is full`,
`storage: quota exceeded`), applies the same row budget the app derives from the grant, and
isolates plugins from one another. A plugin query's `ctx.read` is `undefined` under the harness,
which is the point.
