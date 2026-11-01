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

A channel can also say who reads it. **`audience: 'owner'`** keeps it to the session's owner:
the Lair's Sanctum, where the game master plans with the Castellan, is one. The server keeps it.
Nobody else is sent its messages or can post to it, and your pipelines still read and write it.
`all`, every member, is the default. `main` is always read by everyone, and an owner-only channel
cannot also have personal lanes.

<!-- prelude:
import { genre } from '@serene-pub/sdk'
-->
```ts
export const lair = genre('acme.lair:genre/lair', {
	name: { en: 'Lair' },
	family: 'adventure',
	shape: {
		channels: ['main', { slug: 'sanctum', audience: 'owner', label: { en: 'Sanctum' } }],
	},
})
```

A channel can also have **channel lanes**: `phone:2`, `phone:3`, for several private
conversations under one slug — a persona texting three characters is one `phone` channel with
three lanes. Lanes are not declared. Your pipelines create them by writing to them, and keep
track of who is in each (your genre's extension data is the place). `phone` on its own is lane 1.
A widget lists the lanes a channel holds with `request('channel-lanes', { channel: 'phone' })`,
each with its line count and newest line, and pages one lane with
`request('messages', { channel: 'phone:2' })`. See [Widgets](widgets.md).

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

A channel's messages are sent to the people in the session like any other message, unless the
channel is declared `audience: 'owner'`, and then only the owner sees them. So anything a player
must not see (an opponent's fleet, the answer to a riddle) must never be written to a channel
they read. Keep it in your plugin's [storage](storage.md).

## What a summary reads: lore

A channel says once what its lines are to a summary: `story` (events), `aside` (context, never events) or `never` (no summary reads it, and the host refuses `sources` naming its lines). `main` is `story`; every other channel is `never` until it says otherwise.

## A channel for a few people: `audience: { participants }`

🚧 Provisional. `audience` also takes a list of people. A channel declared this way is read by the
people named, by the session's owner, and by your pipelines, and by nobody else. A phone
conversation between a persona and one character is the shape of it:

<!-- prelude:
import { genre } from '@serene-pub/sdk'
-->
```ts
export const pen = genre('acme.words:genre/pen-pals', {
	name: { en: 'Pen Pals' },
	family: 'adventure',
	shape: {
		channels: [
			'main',
			{ slug: 'letters', audience: { participants: ['character:12', 'user:3'] }, label: { en: 'Letters' } },
		],
	},
})
```

Each entry is a participant reference: `owner`, `user:<id>`, `character:<id>`, `player-seat:<id>`
or `envoy:<slug>`. Which person a reference names is worked out for each viewer, so a character
that a member plays counts as that member. The declaration is refused when the list is empty, when
an entry is not a participant reference, when an entry is `ai`, `item` or `run-owner` (those are
never people, and pipelines read every channel already), and on `main`, which every member reads.

The server keeps it, the way it keeps `'owner'`:

- **Reading.** Someone outside the audience is sent none of the channel's messages or pushes, and
  the channel is left out of their channel list and the composer's switch. The session's owner
  reads every channel, whatever it names.
- **Sending.** The send door refuses a person outside the audience, and a turn fired on the
  channel is refused too, with "That channel is only for the people in it."
- **Personal lanes.** With `lanes: 'personal'` the audience narrows per lane: a lane is read by
  its own person and the session's owner, and only if that person is in the audience.
- **Pipelines.** A read that names the channel (`channel: 'letters'`) reads it, as it reads any
  other. A read over **all** channels leaves such channels out of the history, so a summary or a
  prompt that asked for everything does not pick up a private conversation by accident. Name the
  channel to include it.

`channelAudience(shape, channel)` hands back the declaration (`'all'`, `'owner'` or the object);
any lane of the slug gives the slug's answer. Say **audience** in your own words and labels.
"Private message" is only the interface's label for a lane whose audience is two people.
