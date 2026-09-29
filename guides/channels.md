# Channels

A session's messages live on **channels**, and a genre declares which ones it has. Every session
has `main`. A genre adds more by slug — `manuscript`, `board`, `phone` — and each slug is a
bucket the genre's pipelines write to and read from on purpose. Nothing about a channel is
inferred from its name.

## Declaring one

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
things, each optional:

- **`role`** — how the channel's messages enter a prompt. `conversation` (the default) is turns
  with speakers. `folio` is one block of text with no speaker names, placed before the
  conversation, so the model reads a manuscript as a manuscript and the chat as a chat.
- **`voice`** — whose name a turn *triggered on this channel* seeds under. `character` and
  `narrator` mean what they mean elsewhere; `none` means no seed line at all, which is the
  posture of a continuation.
- **`messageVerbs`** — per-channel availability of the verbs a message offers. Declared keys
  win over the genre's; the floors (stop, branch, edit) cannot be switched off here either.

`main` may only be a conversation. A channel is declared by its slug alone: lanes under it
(`phone:3`) are runtime, allocated by the genre's pipelines, and no lane count is declared
anywhere.

## Where a turn lands

The channel the triggering message was sent on travels with the run. Your respond pipeline reads
it as `$.input.channel` and can branch on it:

```ts nocheck builder fragment: continues a spec chain, and its branch bodies are placeholders
.junction('turn', { on: ($) => $.input.channel }, (r) => r
	.when('manuscript', { equals: 'manuscript' }, /* a continuation */)
	.otherwise('talk', /* a reply */))
```

The reply row is created once, on the spine, with `channel: $.input.channel`, so the answer
lands where the question was asked and the branches decide only what it says. A lane
(`manuscript:2`) is not equal to its slug; if your genre allocates lanes, branch on the parsed
slug.

## One live row per run

A pipeline may write as often as it likes — a reply, the annex, a lore entry, a message on
another channel — and writes may sit inside clauses; in a parallel one they still land in the order
you declared them, whichever chain finishes first. What a run has only one of is its **live
row**: the reply row it opens with `create-message`, the one a stream lands in and Stop finalises.
It may not sit inside an `each` or `loop` (that would be one reply row per pass), and a second
message on the **live row's channel** is refused — at publish when the channel is a literal, by
the host when it is wired. So a game whose opponent talks on `main` may post the board as a bare
message on `board` in the same run, or attach it to the opponent's line as blocks; what it may
not do is put two rows on `main`. Reading is not limited:
the history query takes a `channel` parameter and a frame panel subscribes to whichever channels
it names.

## What a frame sees

A panel is a view onto the channels it declares. That makes the rule for hidden state simple:
**what a frame sees is what the client may see.** Anything a session must keep from the player —
an opponent's fleet, a secret entry — must never be written to a channel at all. See
[Frames](frames) and [Storage](storage).
