# Channels

A session's messages live on **channels**. Every session has `main`; a genre can declare more by
slug (`manuscript`, `board`, `phone`). A channel is a bucket your genre's pipelines write to and
read from on purpose. Nothing about a channel is guessed from its name.

## Declaring one

This is how [Writing Room](https://github.com/SerenePub/serene-pub-plugin-writing-room) gives a
session a talk channel and a manuscript:

```ts
import { genre } from '@serene-pub/sdk'

export const writingRoom = genre('acme.words:genre/writing-room', {
	name: { en: 'Writing Room' },
	family: 'writing',
	shape: {
		characters: { min: 0, max: 1 },
		personas: { min: 0, max: 0 },
		composer: 'text',
		voice: 'character',
		channels: [
			'main',
			{ slug: 'manuscript', role: 'folio', voice: 'none', messageVerbs: { delete: false } },
		],
	},
})
```

A bare string is the whole declaration for an ordinary channel. The long form adds three
options:

- **`role`**: how the channel's messages go into a prompt. `conversation` (the default) is turns
  with speakers. `folio` is one block of text with no speaker names, placed before the
  conversation, so the model reads a manuscript as a manuscript and the talk as talk.
- **`voice`**: whose name a reply to a message on this channel is written under. `character`
  and `narrator` mean what they mean elsewhere; `none` means no name at all, which is what a
  continuation of the manuscript wants.
- **`messageVerbs`**: which message actions (retry, delete, swipe and the others) this channel's
  messages offer. They override the genre's. Stop, branch and edit are always offered.

`main` can only be a conversation.

A channel can also have **lanes**: `phone:2`, `phone:3`, for several private conversations
under one slug. Lanes are not declared. Your pipelines create them by writing to them, and keep
track of them. `phone` on its own is lane 1.

## Where a reply lands

The channel the person wrote on travels with the run. Your reply pipeline reads it as
`$.input.channel` and can branch on it:

```ts nocheck a fragment of a spec chain, with placeholder branch bodies
.junction('turn', { on: ($) => $.input.channel }, (r) => r
	.when('manuscript', { equals: 'manuscript' }, /* a continuation */)
	.otherwise('talk', /* a reply */))
```

Create the reply message once, outside the branches, with `channel: $.input.channel`. The answer
then lands where the question was asked, and the branches decide only what it says. A lane
(`manuscript:2`) does not equal its slug: if your genre uses lanes, branch on the slug part.

## One reply message per run

A pipeline may write as often as it likes: a reply, the annex, a lore entry, a message on
another channel. Writes inside parallel branches still land in the order you declared them.

What a run has only one of is its **live row**: the reply message it opens with
`create-message`, the one a stream fills and Stop ends. It may not sit inside a loop (that would
be one reply per pass), and a second message on the live row's channel is refused, at build when
the channel is written out and at run time when it is wired. So a game whose opponent talks on
`main` may post the board as a separate message on `board` in the same run, or attach the board
to the opponent's line as blocks. It may not put two messages on `main`.

Reading is not limited: the history query takes a `channel` option, and a widget declares the
channels it shows (`widget({ …, channels: ['board'] })`).

## Channels are not private

A channel's messages are sent to the people in the session like any other message. So anything
the player must not see (an opponent's fleet, the answer to a riddle) must never be written to a
channel at all. Keep it in your plugin's [storage](storage.md).
