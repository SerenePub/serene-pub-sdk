# Writing lore from a pipeline

A pipeline files lore through the lore outlets: `create-lore-entry@1`, `update-lore-entry@1`,
`link-lore-entries@1` and `graph-proposal@1`. This guide is about the choices a write makes:
which entry type, whether it is a summary, whether it updates an entry that is already there,
and who the entry is filed under.

## Create or update

`create-lore-entry@1` makes a new entry from a `name` and `content`. `update-lore-entry@1`
changes one you name. When you do not know whether the entry exists yet, give the create a
`match` (see "Updating instead of adding") and it does whichever is true.

## Story events: scenes first

Story events go into scenes first, not history. A death, a treaty, the party reaching a town: put it in a scene.

There are two routes. Write a story line through `create-message@1`. Or use `note-scene@1` for a fact that isn't a line. Notes reach the scene's summary and Compile. `note-scene@1` is refused when the genre writes no scenes, when the scene is another session's, or when no scene is open.

Compile is a person's press. It files a day's scenes under that day's one history entry. Pipelines and plugins cannot run it.

A history write through `create-lore-entry@1` is the second choice. It files onto its day's entry, which is the session's story day when you give no date, and appends a paragraph. A line has one history entry per date.

The packager warns `W_WRITES_HISTORY` when a pipeline writes history directly. A `summarize-request@1` spec is exempt, because its save is previewed and a person applies it.

## Choosing an entry type

The `entryType` param says what kind of entry the write makes. Declare the type once and pass
the declared object to the builders; they write its id into the pipeline's declared defaults.
An entry type nobody declared is refused with the declared types named, never coerced into world lore.

## Summary or change

Pass `sources` when the entry is a summary of the story; leave it off when it is a change in it.

`sources` is a port, not a parameter: wire it to the rows a step read — the messages of
`session-history@1` or `summarize-source@1`/`@2`, a scene's transcript units, or the scenes
`graph-scenes@1` read — and the host takes the message ids from there.

A summary is committed: the session's settle line moves to the newest message it names, and Back no longer reaches below it.

The host keeps every message a run read; naming one the run never read writes anyway, with a note in the receipt.

## Updating instead of adding

`match` finds the entry first — by `entryId`, by `name` or by `key`, within this write's own entry type — and updates it; when two entries answer, the write is refused, naming both, so you can retry with `entryId`.

Use it for the entry that should exist once, such as a running summary kept as world lore (or in the session annex), never as history.

## Filing under a cast member

`bind` takes a `character:<id>` and files the entry under that character's cast member in the book it lands in.

## The shared builders

Core's pipelines file lore with two builders from `@serene-pub/core-catalog`. `fileLore` writes
one entry per item of a list a step produced:

<!-- prelude:
import { fileLore, worldLoreEntryType } from '@serene-pub/core-catalog'
declare const c: any
declare const w: any
declare const listStep: any
-->
```ts
fileLore(c, w, {
	from: listStep,
	member: 'notes',
	listLabel: 'The notes',
	each: 'note',
	noun: 'note',
	max: 4,
	entryType: worldLoreEntryType,
	writeLabel: 'File the note',
})
```

`rememberNote` writes one entry from a name and content already on the chain:

<!-- prelude:
import { rememberNote, worldLoreEntryType } from '@serene-pub/core-catalog'
declare const c: any
declare const w: any
declare const nameOf: any
declare const contentOf: any
-->
```ts
rememberNote(c, w, {
	key: 'save',
	name: nameOf,
	content: contentOf,
	entryType: worldLoreEntryType,
	match: { name: 'Story so far' },
})
```

A plugin may use them or write the explicit outlet call they expand to.

## Advanced: reading what changed, when

No node does this for you, and nothing ships wired: a genre opts in. The dated reads that already exist can be combined into a context template.

- `core:query/history-entries@1` reads the dated history band. It publishes the `history` band (entries keyed by date), which a template reads as `{{history}}`, already laid out.
- `core:query/stat-trail@1` reads one stat's values over time. Its params are `slotId`, `mode` (`both`, `messages` or `timeline`) and `last`; its `since` in-port takes `{ date: { year, month?, day? } }` and keeps timeline points dated on or after it. Its outputs are `main`, `trail` and `points`.
- `core:query/lorebook-state@1` with `at` set to a story date `{ year, month?, day? }` reads the world as it stood then. Set it beside a head read (no `at`) to show what changed. Its outputs are `main` and `state`.
- The `core:var/current-date@1` variable is the present. A template reads it as `currentDate`, with `year`, `month`, `day` and `label`.

```handlebars
Now: {{currentDate.label}}
{{history}}
```

`stat-trail@1` and `lorebook-state@1` publish no band: their documents are JSON. A template names them through the step that feeds Assemble's template context, by the keys of that step's declared out-port schema (`templateScopeAt` lists what a template can reach at a node).

Entry amendments and cast versions are not readable from pipelines yet.

## What the host does for you

Which book, which line, the anchor, the provenance and the lock are the host's; the name, the content, the fields and the entry type are yours.
