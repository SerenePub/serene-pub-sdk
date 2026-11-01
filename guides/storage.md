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

### Your package's own files: `ctx.package`

What your package *ships* is read the same way, from the same handlers. Declare
`assets: { dir: 'assets' }` and a handler reads any file in that folder with
`ctx.package.read(path)`, where `path` is the one a frame appends to `assetsBase`, so it starts
with the folder name. It answers the bytes, or an `err` sentence. It is read-only: there is no
listing, no `exists` and no write, and `lang/` and `ui/` are not assets, so they are refused.
`ctx.package` is handed to exactly the kinds that get `ctx.storage`. 🚧 (M2a)

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
-->
```ts
import { err, ok } from '@serene-pub/sdk'

// Inside a handler, which is (input, ctx).
async function shippedWorld(ctx: PluginHandlerContext) {
	if (!ctx.package) return err('package: not granted to this node kind')
	const file = await ctx.package.read('assets/worlds/harbour.json')
	if (file.kind !== 'ok') return file // e.g. "package: 'assets/worlds/harbour.json' is not one of this package's assets"
	return ok(JSON.parse(new TextDecoder().decode(file.value)) as unknown)
}
```

In a test, give the harness the files: `pluginHandlerContext({ pluginId, kind: 'query', package: { 'assets/worlds/harbour.json': '{}' } })`.

### Each person's own files: `ctx.storage.user`

Some files belong to a *person*, not to the pub: their saved worlds, their own notes. Ask for
them next to your quota, with a quota of their own. It is **per person**: each person gets that
much, and nobody's files count against anybody else's. 🚧 (M2b)

<!-- prelude:
import { defineExtension } from '@serene-pub/sdk'
-->
```ts
export default defineExtension({
	slug: 'showcase.atlas',
	name: 'Atlas',
	version: '1.0.0',
	// ...
	permissions: { storage: { perUser: { quotaBytes: 2 * 1024 * 1024 } } },
})
```

`ctx.storage.user` is the same storage API (`usage()` and `files`), scoped to the person. Who is
"the person"? The signed-in person whose action fired your handler, or the person who pressed
the button or sent the message that started the run. Core decides that; it is never read from
your input and your plugin cannot choose it, so one person cannot reach another's folder. When
the permission is not granted, or no person is acting for the call, every method refuses with a
sentence (`storage.user: per-user storage is not granted`, or `storage.user: no person is
acting for this call`).

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
-->
```ts
import { err, ok } from '@serene-pub/sdk'

// Inside a handler, which is (input, ctx): save this person's notes.
async function saveNotes(ctx: PluginHandlerContext, notes: string) {
	const mine = ctx.storage?.user
	if (!mine) return err('storage: not granted to this node kind')
	return await mine.files.write('notes.txt', new TextEncoder().encode(notes))
}
```

In a test, give the harness a second store: `memoryStorage({ user: memoryStorage() })` (without
`user`, `ctx.storage.user` refuses as if nobody were signed in).

- **Reading from a page.** A page of the app (not a sandboxed frame) can fetch
  `/plugin-data/<your id>/me/<path>`. It answers only the signed-in person's own file, only
  where one of your `storage.serve` globs matches the path after `me/`, and with a `404`
  otherwise, whether or not the file exists. It is never sent to a frame: a frame has no
  cookie, and the answer carries no cross-origin header, so a frame reads per-person files
  through an action of yours. The `me/` segment is reserved: a pub-wide served glob never
  serves a path under `me/`.
- **Removed with the account.** When an administrator deletes a person's account, their folder
  for every plugin goes with it.
- **On uninstall.** Their files are kept by default, in case the plugin is installed again; the
  administrator can choose to delete them at the same time.

### Reading your files in a pipeline: `core:query/plugin-storage@1`

Say your plugin ships a genre, and its create pipeline should load a custom world the person
imported earlier. The world sits in your plugin's storage, and the pipeline reads it with the
**plugin-storage query**. 🚧 (M2a)

It is a query rather than a task because tasks are pure: the same inputs always give the same
output, and a file on disk is state outside the graph. Outside state enters a pipeline through a
query, as the session's annex does.

```ts nocheck the node's ports, as a reference, not code to run
// params: { scope: 'pub' | 'me', as: 'json' | 'text' }
// in:     path   (relative to the folder, for example 'worlds/atlas.json')
// out:    main   (the parsed JSON, or the text; null when the file is missing)
//         found  (true or false)
C.pluginStorage.v1({ path: $.input.worldPath }, { scope: 'me', as: 'json' })
```

- **Only your own pipeline's storage.** A pipeline your plugin ships reads your plugin's files. A
  core pipeline, or one a person wrote, is refused: `plugin-storage reads only a plugin's own
  pipeline's storage`.
- **`scope: 'pub'`** reads the files shared by the whole pub, and needs `storage` granted.
  **`scope: 'me'`** reads the acting person's own folder (see `ctx.storage.user`), and needs
  `storage-per-user` granted and a person on the run. Core picks the person; a port cannot name one.
- **Read only.** One file per read: no writing and no listing. The path is relative and stays
  inside the folder (`..` is refused).
- **Size cap.** A file over 4 MiB is refused, with a sentence naming its size and the cap.
- **A missing file is not an error.** The query answers `found: false` and a null `main`, so the
  pipeline can fall back to a built-in world.

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

### Two runs writing one document

🚧 Provisional. A run that reads your document, works on it and writes it back can lose another
run's write: if a reply's step wrote the document while your press was still working, your write
puts back the old values. Every write that changes a document moves its **annex document version**,
a count that starts at 0. `session-annex@1` gives it on its `version` port. Wire that into
`set-session-annex@1`'s `base` port and the write becomes compare-and-set:

```ts nocheck a fragment: three steps out of the middle of a spec's chain
.query('annex', ($) => C.sessionAnnex.v1({ scope: $.input.sessionScope }))
.task('apply', ($) => myApply({ annex: $.annex.main }))
.outlet('keep', ($) => C.setSessionAnnex.v1({ value: $.apply.annex, base: $.annex.version }))
```

When the version stored is not your `base`, nothing is written. The write result says
`written: false` and `stale: true`, the receipt has a note, and the step's `annex` and `version`
ports carry the document as it stands now, so you can build on it again. Leave `base` out and the
last write wins, as before. Back, Forward and a migration move the version too, so a `base` read
before one of them is refused. The lorebook annex takes one too: `set-lorebook-annex@1` has a `base` port, and
`lorebook-annex@1` gives the book's annex document version on its `version` port.

### Per person: the user annex

🚧 Provisional (M2b). The session annex belongs to a session and the lorebook annex to a book. The
**user annex** belongs to a *person*: small JSON documents a plugin keeps for whoever is using it,
that follow them into every session. A profile, a list of saved worlds, a person's own settings. Use
files (above) for bulk; use the user annex for the small, structured things you want to read and
compare-and-set.

Declare each key with `annexField({ scope: 'user', … })`. A key is exact (`'profile'`) or a family
ending in `/` (`'saves/'`, which covers `saves/alpha`, `saves/beta`, and so on). A user field has no
`see`, `act` or `genre`: only the person's own handlers and applet reach it. Then ask for the
permission, `permissions.applet.annex.user`:

<!-- prelude:
import { annexField, defineExtension } from '@serene-pub/sdk'
-->
```ts
export default defineExtension({
	slug: 'acme.worlds',
	name: 'Worlds',
	version: '1.0.0',
	annexFields: [
		annexField({ scope: 'user', key: 'profile', shape: { type: 'string' } }),
		annexField({ scope: 'user', key: 'saves/', shape: { type: 'object', fields: { turns: { type: 'integer', required: true } } } }),
	],
	permissions: { applet: { annex: { user: true } } },
})
```

A handler reaches it as `ctx.annex('user')`, in the same kinds that get storage (a task is pure, so a
task has no `ctx.annex`):

<!-- prelude:
import type { PluginHandlerContext } from '@serene-pub/sdk/testing'
-->
```ts
// Inside a handler, which is (input, ctx): save one world, but only if nobody changed it meanwhile.
async function saveWorld(ctx: PluginHandlerContext, name: string, turns: number) {
	const mine = ctx.annex?.('user')
	if (!mine) return { saved: false }
	const before = await mine.get(`saves/${name}`)
	const res = await mine.set(`saves/${name}`, { turns }, { base: before?.version ?? 0 })
	return { saved: res.ok }
}
```

- **`get(key)`** gives `{ key, doc, version, updatedAt }`, or `null`. **`list(prefix?)`** gives the keys
  with their versions (no documents, so a listing stays small). **`set(key, doc, { base }?)`** and
  **`remove(key, { base }?)`** answer `{ ok: true, version }`, or `{ ok: false, stale: true, fresh }` when
  `base` is not the stored version (`fresh` is the document as it is now, or `null`; `base: 0` means
  "must not exist yet"), or `{ ok: false, refused }` with a sentence. Leave `base` out and the last
  write wins.
- **Who the person is.** The signed-in person whose action fired your handler, or who pressed the
  button or sent the message that started the run. Core decides; your input cannot name one, and there
  is no way to read another person's documents or list people. With no person acting, or without the
  permission, every method rejects with a sentence (`annex('user'): no person is acting for this call`,
  `annex('user'): this extension was not granted the user annex`). Any host but `'user'` throws.
- **Saved when the call returns.** Your handler reads and writes a copy of the person's documents (it
  sees its own writes), and the writes are saved together, all or nothing, only if the call returns
  normally. A handler that throws saves nothing. If the person's data changed in another call while
  yours ran, yours fails and says so, and nothing of it is saved. Versions you see inside a call are
  provisional: a key you write twice in one call is saved once, one step up on the stored version.
- **Limits.** A key is at most 128 characters; a document at most 64 KiB; a person keeps at most 256
  documents and 1 MiB under your plugin. Core enforces them.
- **Removed with the account.** Deleting a person's account deletes their documents for every
  plugin. **On uninstall** they are kept by default, in case the plugin comes back; the administrator
  can tick one box to delete what it kept for each person, files and documents together.
- **From an applet.** A frame reaches the same documents with the `user-annex` request (`get`, `list`,
  `set`, `remove`), for the viewing person only. See [Frames](frames.md).
- **In a test**, give the harness an annex: `pluginHandlerContext({ pluginId, userAnnex:
  memoryUserAnnex({ profile: 'hi' }) })`. Without `userAnnex`, `ctx.annex('user')` rejects as if
  nobody were signed in.

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

## The lorebook annex

🚧 Provisional. The annex above belongs to one session. A **lorebook annex** is the same thing at
book scope: a document your plugin keeps in the lorebook itself, under the same owner name, for
engine state that is about the *world* and not one playthrough. A town's reputation ledger, the
score a campaign's rival has reached, a map seed: not an attribute (typed facts stay attributes)
and not prose (that is an entry). A session is the save; the lorebook annex is what every session
of the book shares.

Declare a field in it with `scope: 'lorebook'`. It reads and writes exactly like a session annex
field, and the default scope stays `'session'`:

<!-- prelude:
import { annexField, annexFieldAction, defineExtension } from '@serene-pub/sdk'
-->
```ts
export default defineExtension({
	slug: 'acme.rivals',
	name: 'Rivals',
	version: '1.0.0',
	annexFields: [
		// Kept in the session, as every field above.
		annexField({ key: 'last-duel', shape: { type: 'integer', min: 0 }, see: ['person'], act: ['participant'] }),
		// Kept in the lorebook: every session of this book sees and moves the same number.
		annexField({
			key: 'rival-score',
			shape: { type: 'integer', min: 0, max: 100 },
			scope: 'lorebook',
			see: ['person'],
			act: ['owner'],
		}),
	],
})

export const pressRivalScore = annexFieldAction('acme.rivals', 'rival-score')
```

A spec reaches it with its own steps, which mirror the session annex's:

| | session annex | lorebook annex |
|---|---|---|
| read | `core:query/session-annex@1` | `core:query/lorebook-annex@1` |
| write a document | `core:outlet/set-session-annex@1` | `core:outlet/set-lorebook-annex@1` |
| write one declared field | `core:outlet/set-annex-field@1` | `core:outlet/set-lorebook-annex-field@1` |
| the event | `core:event/annex-changed@1` | `core:event/lorebook-annex-changed@1` |

`lorebook-annex` reads the annex of the book the running session reads, and its owner defaults to
your own spec's namespace; reading another owner's takes `sharedAnnex`, as it does for the session
annex. The event's payload names the book, the owner and the keys that moved (and the session, when
a session wrote them), never the values: read them with the query.

Who may write, and what a write is:

- **From a session**, a write is a change to the world made during a story: it is tied to the
  turn, filed as a change that can be taken back (Back) with the stretch it belongs to, and
  routed exactly as an entry write is.
- **From a book-level run**, one with no session behind it, a write is lasting at once.
- A book-level run can write only the fields no genre owns, since a genre's fields are found
  through a session.

Field values are checked against the declared shape in both scopes. A field's own `act` audience
decides who may press its action.

### Migrating a lorebook's documents

When your plugin updates, the `migrate` moment runs once for each stored document of yours, so you
can carry an older shape forward. It now runs over the documents in lorebook annexes as well as
the sessions'. The input's `scope` says which: `{ kind: 'session', sessionId }` or
`{ kind: 'lorebook', lorebookId }`. `sessionId` is only set for a session's document now, so
branch on `scope`.

```ts
import { halt, lifecycleCallback, ok, type LifecycleMigrateInput } from '@serene-pub/sdk'

export const migrateRivals = lifecycleCallback('migrate', async (input) => {
	const { document, fromVersion, scope } = input as LifecycleMigrateInput
	if (scope?.kind !== 'lorebook') return halt('Sessions need no change.')
	// 1.x kept the score under `score`; 2.0 says `rival-score`.
	if (!fromVersion.startsWith('1.') || document['score'] === undefined) return halt('Already current.')
	const { score, ...rest } = document
	return ok({ document: { ...rest, 'rival-score': score } })
})
```

Return `ok({ document })` to store it, or `halt(reason)` to leave it as stored.

## How a session starts: creation modes

🚧 Provisional. A session begins in one of four **creation modes**, set when it is created
(`sessions:create` takes `mode`, and `from` for the two that follow another session). They differ
in what the new session starts from:

| `mode` | the new session starts from |
|---|---|
| `new` (the default) | the lorebook you choose, as it is; the session's own state is empty |
| `new-world` | a *copy* of the lorebook (or of a starter lorebook), so this story changes its own world |
| `branch` | another session of yours, forked at its newest message; the original is untouched |
| `next-chapter` | another session of yours, closed out; only the state marked `nextChapter` carries forward |

`branch` and `next-chapter` need `from` to be a session the person owns. `next-chapter` also needs
that session to have a lorebook. A mode the server does not know is refused with a sentence.

### What a next chapter carries

Mark what should follow the player with `nextChapter: true`, on an annex field or on an attribute
slot:

<!-- prelude:
import { annexField } from '@serene-pub/sdk'
-->
```ts
annexField({
	key: 'bearing',
	shape: { type: 'string' },
	see: ['person'],
	act: ['participant'],
	nextChapter: true,
})
```

When the person starts the next chapter, the new session is seeded in one step, anchored to its
first message: the owner's player seat keeps its name and portrait, the marked attribute values
are carried (those on the session, on cast members seated in both sessions and on the player's
seat), and the marked annex fields of the new session's genre are copied. Nothing else comes with
it: no messages, scenes or history entries. `nextChapter` is `true` or absent; a build refuses
anything else.

### A genre proposes a mode

A genre can say which mode its start form should suggest, with `SessionShape.creationMode`. A
sequel genre proposes `next-chapter`:

<!-- prelude:
import { genre } from '@serene-pub/sdk'
-->
```ts
export const sequel = genre('acme.words:genre/sequel', {
	name: { en: 'Sequel' },
	family: 'adventure',
	shape: { creationMode: { propose: 'next-chapter' } },
})
```

It is a suggestion, never a lock: the row says **Suggested**, the person may pick another, and the
server accepts any mode whatever the genre proposed.

## How much storage you get

`permissions.storage` with no `quotaBytes` asks for 64 MB on the app. A number you give is held to
the band 1 KB to 256 MB, and the pub's administrator may lower it for the install or raise it
past the band. `ctx.storage.usage()` tells your handler where it stands. The in-memory test
storage and the app agree on 64 MB; pass `quotaBytes` to `memoryStorage` to test a different size.
