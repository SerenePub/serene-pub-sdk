# Forms, and the effects line

An action can end a message with a question: a row of **choices**, or a small **form**, addressed
to one participant. The block is an action still waiting for its answer, and only the addressee
may give it.

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

## Who answers

- **A person portrays the addressee** — the buttons are theirs. Anyone else sees *Awaiting an
  answer*.
- **The AI portrays the addressee** — the genre's **answer pipeline** answers as that character
  the moment the asking run finishes: it reads the card and the question, asks for one choice,
  and presses the button as a person would. The run appears as a child of the run that asked.
- **Nobody in particular** — the buttons are open to the action's audience.
- **`owner`** — the person running the session, whether or not they hold a persona. This is how a
  genre puts a question to the human behind the keyboard.

A question is answered **once**. The block records who answered and what they chose, and a
second press is refused naming them.

Every genre declares the `form-addressed` event, and every shipped preset binds an answer
pipeline to it — even a genre whose own forms are all addressed to the owner — because no genre
can promise that no pipeline will ever put a form to a participant the AI portrays, and an
unanswerable form is a stuck session.

## The effects line

Every action declares its effects: **`fiction`** (it changes what the story says) or **`world`**
(it changes what is true outside the story — a lorebook entry, a scene, a setting). The line is
enforced, not advisory:

- A `world` action may appear only where the owner presses it: the composer, a message's own **⋮**
  (the row is its subject — the Lair's *File as a room*), session settings, admin or the review
  gate. Never in a form, the extra tab or a widget. Its audience may name only the owner or an
  admin, never the cast.
- **A choices or form block may not name a `world` action.** The host refuses the block at the
  write. So a question put to the owner cannot, on its own, write a lorebook entry; the write
  belongs to a composer action the owner presses, which may open a **review gate** — the
  outlet's `review: { fields: [...] }` becomes the form the owner edits before anything is
  written. That is how *Add to bible* and *Build room* work.
- A genre declares what its sessions may write at all: `writes: { lore, scenes }` on the shape.
  Absent means both on. A genre that says `lore: false` has a lorebook it reads and never
  touches, and every path that could write it is refused with a sentence naming the genre.

Design with the line, not around it. If a form's answer must change the world, the answer runs
a pipeline and that pipeline's outlet carries the review gate; the block itself only chooses.

## Every action says what it does

An action's `description` is **required**: one plain sentence saying what pressing it does. The
session shows it as the control's tooltip and lists it in the action legend — the *What do these
do?* sheet beside the composer's chips — next to the action's icon, name and slash command. A
declaration without one is refused where it is written, with a sentence naming the action.

Say the effect, not the mechanism: *Roll the dice and post the result*, never *Fires the roll
pipeline*. An icon-only control reads the action's `label` aloud; give `iconAlt` only when the
icon standing alone should say something else, and only beside an `icon`.

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
