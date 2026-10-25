# Writing lore from a pipeline

A pipeline files lore through the lore outlets: `create-lore-entry@1`, `update-lore-entry@1`,
`link-lore-entries@1` and `graph-proposal@1`. This guide is about the choices a write makes:
which entry type, whether it is a summary, whether it updates an entry that is already there,
and who the entry is filed under.

## Create or update

`create-lore-entry@1` makes a new entry from a `name` and `content`. `update-lore-entry@1`
changes one you name. When you do not know whether the entry exists yet, give the create a
`match` (see "Updating instead of adding") and it does whichever is true.

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

Use it for the entry that should exist once, such as a running summary.

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

## What the host does for you

Which book, which line, the anchor, the provenance and the lock are the host's; the name, the content, the fields and the entry type are yours.
