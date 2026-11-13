# Genres, presets and routines

A pipeline says what happens. It does not say when, or in which sessions. That is said once, by
**registering** it: _this trigger runs this pipeline_. A genre carries a list of registrations,
**the genre's defaults**, and every **preset** of the genre is one set of changes on that list. A
person picks a preset when they start a session; an administrator edits presets in **Admin ›
Presets**.

This page is for a plugin that ships a genre, a preset for someone else's genre, or a routine.
The words are the ones in the [vocabulary](vocabulary.md).

## Three ways a pipeline runs

| Kind | It runs when | You register it on |
| --- | --- | --- |
| **event pipeline** | something it listens to happens: a message to answer, a session created, a scene opened | an event: `coreEvents.messageRespond` |
| **action pipeline** | a person presses its action: a composer button, a message-menu item, a slash command | the action: `roll.actions.roll` |
| **routine** | its **cadence** says it is due: after each round, every five turns, every hour | a cadence: `everyNTurns({ n: 5 })` |

Every registration is made with `register(trigger, pipeline, options)`, from the declared objects:
the event, the action handle or the cadence, and the spec you built (or `use('…')` for another
package's). Its key is derived from the two, `message-respond→story-respond`, and you never type
it. A string where an object exists works, and warns.

A pipeline may say which events it **suits**, `.inlet('input', C.userMessage.v1(), { suits:
[coreEvents.messageRespond] })`. That is a hint for the pickers in **Admin › Presets**, nothing
more: registering is what mounts it.

## What a trigger carries, and fit

Each trigger hands the pipeline a few things: the session always, and sometimes a message, a
speaker, a cast member, a scene or the story clock. A pipeline **fits** a trigger when every one
of those its steps read is carried. One that does not fit is refused when it is registered, in
words: _"Story reply reads the speaker; scene-opened carries none."_ Nothing reaches a session
to fail on its first turn.

[Events and what they carry](/docs/sdk/events) lists every event, what an action carries and what
the event each cadence wakes at carries. To check one yourself:

<!-- prelude:
import { coreEvents, eventIdOf, fitOf, type SpecDocument } from '@serene-pub/sdk'
declare const reply: SpecDocument
-->
```ts
const fit = fitOf(reply, { family: 'event', event: eventIdOf(coreEvents.sceneOpened) })
if (!fit.ok) console.log(fit.sentence) // what it reads that the event does not carry
```

A pipeline that reads only the session, and looks everything else up through its steps, fits
anything.

## The genre's defaults

A genre states its defaults with `withGenreDefaults`: the registrations every session of the
genre starts from, and the values of its settings. Keep the registrations in an object, so a
preset can name each one.

<!-- prelude:
import {
	afterEachRound, coreEvents, everyNTurns, onEvent, register, use, withGenreDefaults,
	type ActionHandle, type GenreDecl, type SpecDocument,
} from '@serene-pub/sdk'
declare const lighthouseGenre: GenreDecl
declare const create: SpecDocument
declare const reply: SpecDocument
declare const answerForm: SpecDocument
declare const keepTheLog: SpecDocument
declare const lookBack: SpecDocument
declare const paintScene: SpecDocument
declare const signal: SpecDocument & { actions: { signal: ActionHandle } }
-->
```ts
export const r = {
	create: register(coreEvents.sessionCreated, create),
	save: register(coreEvents.messageOffered, use('core:spec/save-message')),
	reply: register(coreEvents.messageRespond, reply),
	answerForm: register(coreEvents.formAddressed, answerForm),
	signal: register(signal.actions.signal, signal),
	keepTheLog: register(afterEachRound(), keepTheLog),
	lookBack: register(everyNTurns({ n: 5 }), lookBack),
	paint: register(onEvent(coreEvents.sceneOpened), paintScene, { mode: 'off' }),
}

export const lighthouse = withGenreDefaults(lighthouseGenre, {
	registrations: Object.values(r),
	settings: { tone: 'grounded' },
})
```

`withGenreDefaults` takes the genre you declared with `genre()` and returns it carrying its
defaults; ship that one. It exists because your pipelines import the genre (for its settings and
what it plays best with), so the genre cannot import them back.

An event takes as many registrations as you like. They run in their `order`, then by key, each
its own run. A `when` makes one conditional (absent means always):

<!-- prelude:
import { coreEvents, isTrue, not, register, type ConditionProp, type SpecDocument } from '@serene-pub/sdk'
declare const s: { world: { inStorm: ConditionProp<boolean, 'boolean'> } }
declare const reply: SpecDocument
declare const stormReply: SpecDocument
-->
```ts
const calm = register(coreEvents.messageRespond, reply, { when: not(isTrue(s.world.inStorm)) })
const storm = register(coreEvents.messageRespond, stormReply, { when: isTrue(s.world.inStorm) })
```

`s` is `sessionOf(lighthouse, { vocabularies: [lighthouseWords] })`: a typed view of what the
session can hold (the vocabularies you pass, the place the host keeps where your scenes are
placed, its settings, its annex fields), so `s.world.inStorm` exists only if a declaration made
it, with its type. There are no string paths to mistype.

A genre brings no attributes of its own: a session's attributes are its rules'. Say what your genre
**plays best with** in `uses`, by tag, each with the sentence the start form says why:

<!-- prelude:
import { genre } from '@serene-pub/sdk'
-->
```ts
const lighthouse = genre('acme.coast:genre/lighthouse', {
	name: { en: 'Lighthouse' },
	family: 'story',
	uses: {
		verbs: 'any',
		optional: {
			attributes: [{ tag: 'health', kinds: ['number', 'pool'], label: 'a health-like number', why: 'A storm wears people down by it.' }],
			zoneTypes: [{ tag: 'inventory', label: 'somewhere to keep what they carry', why: 'What the keeper picks up stays with them.' }],
		},
	},
	events: {},
})
```

Rules that lack one play that part in words; the rating says so, and nothing is locked. 🚧 Say
which time your genre keeps with `keepsTime` (`'story'`, `'real'` or `'none'`), and ruleset fit
weighs the rules' `countsTime` against it. A genre that names `slots`, `sheets` or
`customAttributes` is refused: what your own pipelines keep for their tools belongs in your annex
fields.

## Routines and cadences

A routine is a pipeline that starts through the routine inlet, `C.routine.v1()`. The inlet hands
it three things and nothing opinionated: `session` (always), `routine` (where it resides: its
registration, its preset, its cadence and options, the turn or scene it fired on) and `cause`
(what the moment it woke at carried: the turn's message, the event's own entities, the clock's
move).

Core's cadences:

| Cadence | Due |
| --- | --- |
| `afterEachTurn()` | after every turn, once what it set off has settled |
| `everyNTurns({ n })` | every `n` turns |
| `afterEachRound()` | once every active speaker has had a turn: whoever the turn order seats or prepares, and every person who spoke |
| `everyNRounds({ n })` 🚧 | every `n` rounds |
| `afterEachScene()` | when a scene closes |
| `whenIdle({ minutes })` | once, after the session has been quiet that long (a multiple of 5) |
| `onEvent(event, { where })` | when the event happens, optionally only where a condition holds |
| `whenValue({ when })` | when a condition over the session's values becomes true |
| `systemCron({ every, unit })` | every so often in real time: minutes (5 at the finest), hours, days |
| `timelineCron({ every, unit, maxJump })` | every so often in story time, when the story clock moves |
| `schedule({ clock, at })` | at a set time: once, daily, weekly, monthly or yearly, on either clock |

A cadence answers one thing, due or not, and hands the routine nothing of its own. The host asks
it only at the events it wakes on (`wakesOn`: event ids such as `core:event/turn-ended@1`, the
system tick, or `*` for every event), so a cadence that is not due costs nothing.

**Turns and rounds.** Every line on a lane is a turn of that lane, by its speaker (a person's seat
or card, a character, an envoy, or `narrator` for the pipeline's own voice). `turn-ended` says the
lane, the turn's number in it, the round and how many turns each speaker has taken this round
(`turnsBy`); `round-ended` says the round and who spoke in it. Core's turn and round cadences count
the story's lane (`main`); a turn on another lane reaches a routine through `onEvent` with a
`where` on its `lane`. A condition, a cadence script and a ruleset script read the story lane's
count as `session.turn`, `session.round` and `session.lastSpeaker` (`sessionOf(genre).turn`, …).

A routine registered on `afterEachTurn()` or `afterEachRound()` offers the session's owner the
other of the two as **When it runs**: Story's reckoning runs after each round unless the owner
picks after each turn. Its key, its values and its queue stay its own.

A routine or an action whose pipeline needs a model nothing on the pub can serve (one that draws,
speaks, hears or sees) is **unavailable**: it never runs, the session's settings say what it needs
(_Unavailable: needs a model that can draw pictures._), and administrators see it on the preset.
A preset's card says what it needs and what would make it better
(_Needs: a text model · Better with: an image model_).

What every routine can count on:

- **It waits.** A routine runs only once every action and event run in its session (and what they
  set off) has finished. Across sessions, people's replies and actions reach the model before any
  routine does.
- **Each firing is its own run**, in order. Nothing is merged or dropped, except as **Allow
  stacking** says below.
- **A person chooses its mode**: **Off**, **Review** (it runs, and holds what it would change for
  someone to accept) or **Full**. A routine you register with `mode: 'off'` is still listed in the
  session's settings, so the owner can turn it on. The owner can also **Run now** from the
  composer.
- **It acts as the session's owner**, inside that session, under your package's grants. Its
  receipt says _routine ‹name›, for ‹owner›_.
- **It is never recursive.** What a routine writes wakes no routine.
- **Real-time routines stop by themselves.** A routine on `systemCron`, `whenIdle` or a real-time
  `schedule` pauses when nobody has played for a while, or after so many runs in a row; the pub,
  each person and an administrator per routine set those limits. After the app restarts, a
  session's real-time routines wait for someone to play before they run again, and nothing missed
  while it was down is made up.
- **A big jump of the story clock fires once.** Each `timelineCron` due within the jump runs once;
  `maxJump` skips the run when the clock jumps further than you say ("Skip when the clock jumps
  more than …").

### Weather each day

`weatherSpec()` (`core:spec/weather`) is a routine that picks the day's weather without a model. Each time the story day turns it hashes the session and the story day (FNV-1a 32-bit of `sessionId|year-month-day`) and takes one of `weatherSlot`'s declared kinds, so the same day always brings the same weather. It writes `core:slot/weather@1` on the world and nothing else; with no story clock it writes nothing. It is off until a genre registers it:

```ts
import { afterEachDay, register } from '@serene-pub/sdk'
import { weatherSpec } from '@serene-pub/core-catalog'

register(afterEachDay(), weatherSpec())
```

### A routine that writes as a character

`characterReachesOutSpec({ speaker, channel?, brief })` (`core:spec/character-reaches-out`) is an example of a routine whose line is a character's own. When its cadence comes due it opens a generating row spoken by `speaker` (`character:<id>`) on `channel` (default `main`), makes one model call with that character's card in context and the `brief` as the last turn, then fills the row with the text. It is not in any shipped list; a genre builds it with its terms and registers it:

```ts
import { afterEachDay, register } from '@serene-pub/sdk'
import { characterReachesOutSpec } from '@serene-pub/core-catalog'

register(afterEachDay(), characterReachesOutSpec({ speaker: 'character:7', brief: 'Write the player a short note about your day.' }))
```

### A pass over the seats that changed

A genre that declares `shape.turnSeatChanges: true` gets, on every `turn-ended` and on a routine's `cause`, the seats that were added, removed or changed since the previous turn of that lane (`TurnSeatChange`: `ref`, `seatKind`, `castMemberId`, `change`). Off unless the genre opts in; with it on, the list is empty when nothing changed. A plugin never parses `ref`: it passes it on.

<!-- prelude:
import { afterEachTurn, genre, register, type RoutineCause, type SpecDocument } from '@serene-pub/sdk'
declare const welcomeNewcomers: SpecDocument
declare const cause: RoutineCause
-->
```ts
// In the genre: opt in.
genre('my.pack:genre/tavern', { name: 'Tavern', family: 'tavern', shape: { turnSeatChanges: true } })

// In its defaults: one firing per turn, none skipped (a skipped firing would lose that turn's list).
register(afterEachTurn(), welcomeNewcomers, { allowStacking: true })

// In a script: read the list typed.
const joined = (cause.turnSeatChanges ?? []).filter((s) => s.change === 'added').map((s) => s.ref)
```

### Allow stacking

**Off by default.** With it off, a firing that finds the same routine already **waiting** is
skipped (a firing while it **runs** still queues one, so what changed during the run gets one
follow-up). That is right for most routines: three turns in a row need one look back, not three.

Turn it on when every firing matters, typically when the routine reads who or what caused it. A
routine that keeps a ledger of stat changes must see both of two people's changes, even when the
second arrives while the first waits:

<!-- prelude:
import { onEvent, register, type SessionEventDecl, type SpecDocument } from '@serene-pub/sdk'
declare const statChanged: SessionEventDecl<{ who: string; stat: string; by: number }>
declare const keepTheLedger: SpecDocument
-->
```ts
const ledger = register(onEvent(statChanged), keepTheLedger, { allowStacking: true })
```

Here `statChanged` is an event your package declares and records (see [Events](events.md)).

### Test a cadence before you ship it

`simulateCadence` drives a cadence through a list of events on a fake clock, the way the host
would:

<!-- prelude:
import { everyNTurns, simulateCadence, turnEvents } from '@serene-pub/sdk'
-->
```ts
const run = simulateCadence(everyNTurns({ n: 5 }), turnEvents(1, 12))
run.fired // [4, 9]: turns 5 and 10
```

## Summaries

### Three ways to register a summary

An action is a person's press and may read the newest lines, because the person is vouching; an event is a scene that closed, complete by construction; a routine keeps up in the background and must stay out of the newest lines.

### What a summarizer writes

A summarizer writes a scene, held for review: its save is previewed and a person applies it. A person's Compile then files the day's scenes under that day's one history entry. See [Story events: scenes first](writing-lore-from-a-pipeline.md#story-events-scenes-first).

### How old a line must be: minAge

`minAge` is a count of lines: 20, the routine default, keeps the 20 newest lines of a lane out of a routine's `sources`; actions and events default to 0.

The same summariser may be registered twice with different values — `minAge: 20` on a cadence and `minAge: 0` on the Close out action — without being written twice. Core's own scene summarizers already contribute the `close-out` action, and core-catalog's `summaries()` registers it with `minAge: 0`, so a genre built on them gets Close out without writing the second line; the snippet below is for a summarizer of your own.

<!-- prelude:
import { register, everyNTurns } from '@serene-pub/sdk'
declare const summarizer: import('@serene-pub/sdk').PipelineInput
declare const closeOutAction: import('@serene-pub/sdk').TriggerInput
-->
```ts
register(everyNTurns({ n: 10 }), summarizer, { minAge: 20 })
register(closeOutAction, summarizer, { minAge: 0 })
```

### When history settles

`history: { settle: 'on-write' }` is a genre saying what kind of game it is: every write settles as it lands, Back is refused, Hide and Branch still work, and no preset may loosen it.

### When the scene moves on

Story's sweep has a duty that asks the model whether the story moved on to a new scene since its last look:
**Notice when the scene moves on**. The host asks only when the answer could be used — the session places scenes
and its scene setting is not Manual, the scene has run at least 6 lines, no boundary trigger already fired in the
lines since the last look, and no suggestion is waiting — so a quiet session costs no call. The model is shown those
lines numbered and names the one the new scene begins at; core maps the number back onto those lines, so a
suggestion never reaches further back than the last look.

The answer is a scene cue of its own kind, `judged` (`JUDGED_SCENE_TRIGGER`), its reason the model's few words,
written through `core:outlet/propose-scene-cue@1`. From there the session's scene setting decides, as for any cue:
Suggested asks (*New scene?*), Automatic starts the scene. A sweep on Review always asks (`ask: true`).

### Scenes: a routine, a couple of rounds late

Core no longer watches each message for scene boundaries. A genre that wants them handled registers a routine for
it, from `@serene-pub/core-catalog`:

```ts
register(everyNRounds({ n: 2 }), sceneBoundariesSpec())
```

The spec (`core:spec/scene-boundaries`, 🚧) runs code only, no model. Its query `core:query/scene-boundaries@1` 🚧
reads the lines at least `depth` rounds old (default 2) and returns `{ at, trigger, reason }[]`: the line each
boundary trigger fired at, which trigger, and its words. Each one goes through `core:outlet/propose-scene-cue@1`
with its `trigger` (🚧 optional in-port; absent means `judged`), and the session's scene mode decides: Automatic
begins the scene, Suggested asks, Manual does nothing. Core places nothing by itself, and a preset drops the
registration like any routine (Story's Minimal does). A person's *Start scene here* and *End scene here* stay
immediate.

### Scenes: a routine that summarizes them

A genre that wants its finished scenes summarized by itself registers a second routine from
`@serene-pub/core-catalog`:

```ts
register(everyNRounds({ n: 2 }), sceneSummariesSpec(), { minAge: 0 })
```

The spec (`core:spec/scene-summaries`, 🚧) calls no model itself. Its query `core:query/scene-summary-due@1` 🚧
returns the oldest scene on `main` that ended at least `depth` rounds ago (default 6) and that nobody has decided
about: a summary a person saved, a discarded review, a failed run, and one being written or waiting for review are
never taken. It hands that scene to `core:outlet/summarize-finished-scene@1` 🚧, which starts the genre's own
scene summarizer, the one a person's *Summarize* runs. The routine's mode decides what happens to the result: Full
saves the summary (and the scene's name, only while it still has its automatic one) with `summary_origin =
'routine'`, which is not yet the record (Back can go into the scene, and nothing settles) until a person saves it;
Review waits for the person, as a summary they started does; Off runs nothing. Story's Minimal preset drops the
registration like any routine. The age guard is the query's `depth`, so the registration's `minAge` is 0.

A step's `expose.purpose` is the line the routines list prints for a routine. It is allowed on any step of a
pipeline that calls no model at all, so a code-only routine can say what it does; in a pipeline that calls a model
(counting swap options) it is still refused on a step that is not a model call. `build()` and `validate()` check it.

## A turn, end to end

Story's **Living** preset, one person and one character:

1. The person sends a line. The send is a pipeline too: `message-offered` runs the save.
2. The message asks for an answer: `message-respond` fires, carrying the session, the message,
   the speaker due and the person. The genre's defaults register Story's reply on it, and it runs.
3. The reply's line lands, and the turn ends: core raises `turn-ended`, then `round-ended` once
   every active speaker has had a turn (here: the person and the character).
4. The reckoning (`register(afterEachRound(), storyReckoning)`) is due. It queues behind the
   reply, waits for anything the reply set off, and runs: it reads the reply and notes what
   changed.
5. Every fifth turn, the sweep (`register(everyNTurns({ n: 5 }), storySweep)`) queues the same way
   files a summary, lore and the cast, and asks whether the scene moved on.
6. The session's settings are derived from what is registered: the genre's settings, a card for
   each registered pipeline that exposes something, and a **Routines** list with each routine's
   mode. Nothing is declared twice.

## Presets: changes on the genre's defaults

A preset belongs to one genre and states only what differs from its defaults. A preset that
changes nothing **is** the genre's defaults; mark one `default: true` and it is the genre's
default preset.

<!-- prelude:
import { preset, setting, type GenreDecl, type RegistrationDecl } from '@serene-pub/sdk'
declare const lighthouse: GenreDecl
declare const r: Record<'reply' | 'keepTheLog' | 'lookBack' | 'paint', RegistrationDecl>
-->
```ts
export const living = preset({
	slug: 'lighthouse-living',
	genre: lighthouse,
	label: 'Living',
	description: 'The log keeps itself: after each round it notes what changed.',
	default: true,
})

export const quiet = preset({
	slug: 'lighthouse-quiet',
	genre: lighthouse,
	label: 'Quiet',
	description: 'One model call a turn: nothing keeps the log or looks back.',
	drop: [r.keepTheLog, r.lookBack],
	change: [
		{ of: r.reply, values: { reading: { params: { scene: false } } } },
		{ of: r.paint, mode: 'review' },
	],
	settings: { tone: setting('grim', { lock: true }) },
})
```

- `register: [...]` adds registrations, `drop: [...]` removes some, and `change: [{ of, … }]`
  changes one's `values`, `mode`, `when`, `order`, `allowStacking` or caps.
- `values` set a step's params, prompt, template, loadout or sampling, by the step's key. They
  never name a connection.
- `settings` set the genre's settings for sessions on this preset. `setting(value, { lock: true })`
  keeps sessions from changing it; `setting(value, { askAtStart: true })` puts it on the start
  form.
- **One level.** A preset never builds on another preset: `extends`, `base` and the like are
  refused. To start from another preset, copy its changes; **Clone** in Admin does the same.

### What a session's owner may change

A setting reaches the session's owner only when its declaration says `reach: 'owner'`; anything
else is an administrator's. **Model plumbing never reaches a member**: a connection, sampling, a
loadout, a prompt or a template declared `reach: 'owner'` is refused. A setting that can never
change once the session exists is `fixedAtStart: true`: it is asked on the start form when the
owner may set it, taken from the layers otherwise, and read-only afterwards. See
[Where values come from](where-values-come-from.md) for the whole cascade.

How far a session's owner and its players may change **sheets and items by hand** is read the
same way: a genre opts in by placing a shared field under the key core reads in its
`shape.fields` (with its own default), or pins the value silently in its `settings`.
`OWNER_SHEET_LATITUDE_FIELD` (`ownerSheetLatitude`) and `PLAYER_SHEET_LATITUDE_FIELD`
(`playerSheetLatitude`) take `as-ruled · no-edits · all-own · all-any`;
`OWNER_ITEM_MOVES_FIELD` (`ownerItemMoves`) and `PLAYER_ITEM_MOVES_FIELD` (`playerItemMoves`),
a permission of their own for giving, dropping and picking up, take
`follow-sheet · no-moves · own-items · any-items`, so a strict table can let players hand items
over while their sheets stay locked. At `as-ruled` each attribute's `changedBy` decides; the other
levels set it aside, but never pass a stat locked for everyone or a value its earshot keeps from
the person. A genre that says nothing plays `as-ruled` for both roles, and a watcher never
changes anything. `KEEP_EVERY_TURN_FIELD` (`keepEveryTurn`, labelled Honour mode) keeps every
turn: nobody deletes the latest turn. These limit a person's hand only, never a pipeline or a
run; the host judges each hand edit with `sheetLatitudeAllows`. `HONOR_MODE_FIELD` (`honorMode`)
is deprecated in their favour.

## A preset for someone else's genre

A package can build on other packages: register their pipelines and their events in a preset of
its own, for a genre it does not own. Name what you build on with a version range, and the preset
carries the requirement:

<!-- prelude:
import { coreEvents, preset, register, systemCron, use, type SessionEventDecl, type SpecDocument } from '@serene-pub/sdk'
declare const rolled: SessionEventDecl<{ total: number }>
declare const tellTheRoll: SpecDocument
-->
```ts
export const weathered = preset({
	slug: 'weathered-story',
	genre: use('core:genre/story'),
	label: 'Weathered',
	description: 'Living, with the weather turning every hour and each roll told in the story.',
	register: [
		register(systemCron({ every: 1, unit: 'hours' }), use('acme.weather:spec/turn-the-weather@^2')),
		register(rolled, tellTheRoll),
	],
	requires: ['acme.dice@^1.2'],
})
```

`use('…@^2')` adds `acme.weather@^2` to the preset's requirements, and `requires` lists the rest:
here the dice package, whose `rolled` event your own `tellTheRoll` answers (import the event from
the dice package's module, so it is an object, not a string). When a package the preset requires
is missing, switched off, or outside the range, the preset is withdrawn from the start screen;
sessions already on it keep their rows and say what is missing, and nothing is deleted. It comes
back when the package does.

## Check it before you publish

The registration door is one function, and your package build, an install and the preset editor
all call it: `registrationFindings(registrations, { pipeline, layer })`. It judges fit, cadence
options (System Cron in multiples of 5 minutes, no seconds anywhere), the routine-only options,
values that name a connection, exposed plumbing, duplicates (a warning) and cycles among the
events your pipelines emit (refused). The conformance kit holds a host's whole catalogue to the
same laws: every registration fits (C35), no plumbing reaches a member (C36), every preset is one
level on one genre (C37). See the [laws](/docs/sdk/laws).
