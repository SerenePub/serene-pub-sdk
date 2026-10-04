# Forms, actions and the effects line

An [action](vocabulary.md#action) is anything a person can press. This page covers what an action
can do beyond a plain button: ask a question inside a message, collect text or people before it
fires, and change things outside the story under the owner's eye.

## Asking a question in a message

A pipeline can end a message with a question: a row of **choices**, or a small **form**,
addressed to one participant. The question is an action still waiting for its answer, and only
the addressee may give it.

<!-- prelude:
import { type SpecBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
declare const chain: SpecBuilder<{}>
chain
-->
```ts
.task('offer', C.makeChoices.v1({
	// the document the block is made from: the question and its options
	json: {
		question: 'This room is empty. What now?',
		options: [{ key: 'build', label: 'Build this room' }, { key: 'improvise', label: 'Let the narrator improvise' }],
	},
	addressee: 'owner',
	fn: 'room',
}))
```

A press on an option fires the action the block names. A form block carries fields instead of
options. [Twenty Questions](https://github.com/SerenePub/serene-pub-plugin-twenty-questions) asks
for a guess this way: its *Guess* button posts a message with a one-field form, and submitting
the form fires a second pipeline that judges the guess.

### Who answers

- **A person plays the addressee**: the buttons are theirs. Everyone else sees *Awaiting an
  answer*.
- **The AI plays the addressee**: the genre's **answer pipeline** answers as that character as
  soon as the asking run finishes. It reads the card and the question, asks the model for one
  choice, and presses it as a person would. The answer appears as a child of the run that asked.
- **No addressee**: the buttons are open to everyone the action allows.
- **`owner`**: the person running the session, whether or not they play a character. This is how
  a genre puts a question to the human at the keyboard.

A question is answered **once**. The block records who answered and what they chose, and a
second press is refused, naming them.

Give your genre an answer pipeline even if every form it asks is addressed to the owner: another
pipeline may one day put a form to a character the AI plays, and an unanswerable form is a stuck
session. The showcase plugins each ship one (`answerForm` in Whodunit and Writing Room).

### How far a chain may run

An answer can fire an action, whose pipeline asks another question, which is answered, and so
on. One such tree of runs may go **four runs deep** and hold **sixteen runs** in all. At a limit,
the next run waits for the session owner, who sees the chain and chooses **Continue** (allowing
four more levels and sixteen more runs) or **Stop here**. Nothing runs past a limit unasked.
[Events](events.md#loops) share the same limits.

## Collecting text or people first

An action can ask for something before it fires, with `collects`. Every press of it (a button,
a menu item, an option in a form) opens a small dialog; a slash command can supply the text
instead.

<!-- prelude:
import { type ActionDecl } from '@serene-pub/sdk'
-->
```ts
export const whisper = {
	key: 'whisper',
	venue: { kind: 'composer' },
	label: 'Whisper',
	description: 'Tell one or more characters something only they hear.',
	collects: {
		text: { need: 'required', label: 'What do you whisper?' },
		recipients: { label: 'Who hears it', min: 1 },
	},
} satisfies Omit<ActionDecl, 'genre'>
```

- **`text`** reaches the run as `input.text`, trimmed. `need: 'required'` will not fire without
  some. `need: 'optional'` fires on an empty box too, and then needs `ifEmpty`: one sentence
  saying what an empty submit does.
- **`recipients`** is a pick from the session's enabled cast, within `min` (at least 1) and
  `max`. It reaches the run as `input.recipients`, a list of `character:<id>` references, checked
  by the host.

## The effects line

Every action declares its effects: **`fiction`** (it changes what the story says) or **`world`**
(it changes what is true outside the story: a lorebook entry, a scene, a setting). The line is
enforced, not advisory:

- **A `world` action appears only where the owner presses it**: the composer, or a message's own
  **⋮** menu (with that message as its subject). Never in a form, the turn controls or a widget.
  Its audience may name only the owner or an admin, never the cast.
- **A choices or form block may not name a `world` action.** The host refuses the block when it
  is written. So a question put to the owner cannot, on its own, write a lorebook entry. The
  write belongs to a composer action the owner presses.
- **A genre says what its sessions may write at all**: `writes: { lore, scenes }` on its shape.
  Absent means both are allowed. A genre that says `lore: false` reads its lorebook and never
  touches it, and every path that could write it is refused with a sentence naming the genre.

Design with the line, not around it. If a form's answer must change the world, the answer runs a
pipeline, and that pipeline's write goes through review.

## Review before a write

A node definition that writes or calls out (`effects: 'write'` or `'external'`) can be put
behind a **review gate**: the run pauses before the step and a person approves, edits or refuses
what it is about to do. The definition declares which of its inputs the reviewer may edit:

```ts nocheck an excerpt of a node definition
review: { fields: ['title', 'content'] }, // `[]` when the reviewer can only approve or refuse
reviewDefault: 'on',                      // optional: start with review switched on
```

Never list a field that names a row (a message id, a target): the person's right to act on that
row was checked before the run started.

Your spec's shipped config can start a node with review on:
`.preset('default', { label: 'Default', default: true }, (p) => p.settings('write', { review: 'on' }))`,
where `write` is the node's key. Writing Room's *Add to bible* does this, so the owner sees the
new lore entry and can edit it before it is written. An admin can switch review on or off for
any such step.

## Every action says what it does

An action's `description` is **required**: one plain sentence saying what pressing it does. The
session shows it as the control's tooltip and in the action legend (*What do these do?*, beside
the composer), next to the action's icon, name and slash command. A declaration without one is
refused where it is written.

Say the effect, not the mechanism: *Roll the dice and post the result*, never *Fires the roll
pipeline*. An icon-only control reads the action's `label` aloud. Give `iconAlt` only when the
icon on its own should say something else, and only beside an `icon`.

<!-- prelude:
import { type ActionDecl } from '@serene-pub/sdk'
-->
```ts
export const roll = {
	key: 'roll',
	venue: { kind: 'composer' },
	quick: true,
	slash: 'dice.roll',
	label: { en: 'Roll' },
	description: { en: 'Roll the dice and post the result.' },
	icon: 'dices',
	iconAlt: { en: 'Roll the dice' },
} satisfies Omit<ActionDecl, 'genre'>
```

`quick: true` puts the action on the composer's main row instead of its overflow menu.

## Turn controls

The buttons beside the composer that move the session along are **turn controls**, and a genre
chooses which it offers with `turnControls` on its shape:

- **`advance`**: *Continue*, the next speaker in the turn order takes their turn.
- **`pick`**: choose who speaks next.
- **`narrate`**: the narrator writes the next line.
- **`retake`**: regenerate the last turn. Off unless the genre turns it on.

Each is `true`, `false`, or `{ presentWhen: … }` to show it only while a condition on the
session's values holds. Left out, Continue and Pick are offered when the genre has characters,
and Narrate when its voice is the narrator. The server refuses a press of a control the genre
does not offer.

## What the build checks

`serene-pub check` and `serene-pub build` refuse, with a sentence naming the place, before
anything is installed:

- a wire whose value does not fit the port it goes into;
- a second message on the live row's channel, or a reply message inside a loop (see
  [Channels](channels.md#one-reply-message-per-run));
- an action with no `description`, a `world` action in a venue the owner does not press, and a
  block that names a `world` action;
- an event recorded outside the scope your package declared (see [Events](events.md));
- a node of yours used by another package's pipeline while it is private;
- a task that reads `ctx.storage` or `ctx.fetch`, and an outlet of yours that does not declare
  `effects: 'emit'`.

Most of them run again when a pipeline is installed, saved and run, so a document edited by
hand cannot slip past them.
