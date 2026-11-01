# Time

A session can keep its own **story clock**: the moment the story has reached, which has nothing to
do with the time on the wall. It moves when a person says so (*Time passes…*), when a reply takes a
tick, or when a pipeline of yours moves it. Everything on this page is about what your genre,
ruleset or routine can do with it. The calendar the clock counts in belongs to the lorebook: months,
weekdays, eras, and now the parts of a day and the seasons.

Everything here is 🚧 provisional.

## Moving the clock to a time of day

`core:outlet/advance-story-clock@1` moves the clock **by** an amount (`by` and `unit`: three hours,
a day) or **to** a moment of the day. The second is what "sleep until seven" wants: you do not
know how many hours that is, and it is not the same every night.

`to` is a clock target, `{ hour, minute?, day? }`:

- **`hour`** is 0 to 23, and **`minute`** is 0 to 59 (absent is 0).
- **`day`** says which day. `next`, the default, is today when that moment is still ahead and
  tomorrow when it is not. `today` is refused when the moment is not ahead. `tomorrow` is always
  tomorrow.

A target never moves the clock back. Exactly one of `by` and `to` may be wired; wiring both is
refused with a sentence that names both, and when `to` is wired the `by` and `unit` parameters are
not read. The move is one row in the session's state ledger ("Time passes…") and goes back with the
message that made it, like any other move.

```ts nocheck a step inside a spec's builder chain, with placeholder wiring
c.outlet('sleep', () =>
	C.advanceStoryClock.v1({
		to: { hour: 7, day: 'next' },
		cause: 'action',
		onRefusal: 'skip',
		params: slot.params(),
	}),
)
```

The step has an extra out-port, **`moved`**: how many minutes a `to` move moved the clock. It is
0, and no ledger row is written, when the clock already stood where it was told to go (or when
`onRefusal: 'skip'` swallowed a refusal). ⚠ `moved` is a port of the step, not a field on `main`:
wire it from the step's `moved` out-port; it is not inside what `main` carries.

## Things that change each hour

The ruleset function `core:function/recurring@1` moves an attribute every turn, round, scene or
day. It also takes `hour`: on every clock move it takes one step for each whole hour mark the move
crossed, in a single anchored write (`by` times the hours crossed). Hunger that grows by one an
hour, a lamp that burns down:

<!-- prelude:
import type { FunctionRef } from '@serene-pub/sdk'
-->
```ts
export const functions: FunctionRef[] = [
	{
		ref: 'core:function/recurring@1',
		key: 'hunger',
		bindings: { what: 'hunger' },
		options: { every: 'hour', by: 1, awakeOnly: true },
	},
]
```

**`awakeOnly: true`** skips every hour that passes while the player is asleep. A session counts
as asleep when it has at least one player seat and every one of them reads
`core:slot/asleep@1` as true (see below). Without `awakeOnly`, an overnight move charges the
whole night.

An hourly step needs a clock. With none, the step writes nothing, and the session's ledger says
once, "The story has no clock yet; hourly routines wait.", rather than failing every turn.

## Once each story day

`afterEachDay()` is a cadence: once for every story day that turns. It is the Timeline Cron with
`every: 1, unit: 'days'`, spelled out. A big jump of the clock fires it once for each day passed;
add `maxJump` on `timelineCron` yourself if you want a long jump to skip it instead. What a daily
routine suits is something that happens whatever anyone is doing:

```ts nocheck registrations in a genre's list, with the specs imported from core's catalogue
register(afterEachDay(), weatherSpec())
register(afterEachDay(), characterReachesOutSpec({ speaker: 'character:7', brief: 'Write the player a short note about your day.' }))
```

`weatherSpec()` picks the day's weather without a model, the same for the same session and day,
and writes it to `core:slot/weather@1` on the world. `characterReachesOutSpec` opens a line spoken
by a character. Both are described under *Weather each day* and *A routine that writes as a
character* in [Genres, presets and routines](genres-presets-and-routines.md).

## The day's parts and the seasons

A calendar can say what the day is made of and how the year turns. Both are on the **calendar**,
not on the genre, so a book keeps them in every session and genre that reads it:

- **`periods`**: the parts of the day by starting hour, `{ id, label, from }`, in order, `from` being
  0 to 23 and rising. Left out, the book uses morning from 5, day from 12, dusk from 18 and night
  from 22.
- **`seasons`**: `{ days, labels }`: how many story days one season lasts, and the four seasons'
  labels in order. Left out, there are no seasons.

A genre gives the calendar of the own books its sessions make with `SessionShape.calendar`. It
is a starting point only: it is never written onto a book the session merely reads.

<!-- prelude:
import { genre } from '@serene-pub/sdk'
-->
```ts
export const harbour = genre('acme.tales:genre/harbour', {
	name: { en: 'Harbour' },
	family: 'adventure',
	shape: {
		calendar: {
			periods: [
				{ id: 'dawn', label: { en: 'Dawn' }, from: 5 },
				{ id: 'forenoon', label: { en: 'Forenoon' }, from: 9 },
				{ id: 'afternoon', label: { en: 'Afternoon' }, from: 13 },
				{ id: 'tide-turn', label: { en: 'Tide turn' }, from: 18 },
				{ id: 'night-watch', label: { en: 'Night watch' }, from: 22 },
			],
			seasons: { days: 90, labels: [{ en: 'Thaw' }, { en: 'Long light' }, { en: 'Gales' }, { en: 'Ice' }] },
		},
	},
})
```

Leave out `months` and the book keeps core's own-book calendar (twelve months) with your periods and
seasons laid on it. A calendar that is out of order, repeats a period id or has the wrong number of
season labels is refused when the genre is declared.

## What a function reads: derived slots

The periods and seasons surface as read-only attribute slots on the world. Nothing stores them;
each is worked out from the clock whenever it is read:

| Slot | Reads as |
| --- | --- |
| `core:slot/day-period@1` | the `id` of the day part the clock's hour is in, from the calendar's `periods` |
| `core:slot/season@1` | the season's label, from the calendar's `seasons`; absent with no date or no seasons |
| `core:slot/time-of-day@1` | the older four-way reading (morning, day, dusk, night) of the same hour, kept as it was |

`core:slot/asleep@1` is different: it is stored. It is a yes-or-no value (default false) that a
rule or a pipeline sets for a person, and it is read on the player's seat. It is what `awakeOnly`
looks at.

## Where the cast is at an hour

`core:query/cast-presences@1` also answers *where is everyone at this hour*, for a ruleset that
gives a cast member a [`schedule` field](rulesets.md#a-weekly-routine-the-schedule-field). Wire its
**`atHour`** in-port with a clock target and read the **`placements`** out-port, a list of
`{ bindingId, where }`. Unwired, `atHour` is the clock's present hour, today.

- The schedule used is the first `schedule` field on the first entry the member holds that has one.
  A member with none is left out of `placements`.
- The pair is the last `[hour, where]` at or before the hour; before the list's first hour, its
  last.
- The day is the target's (`next`, `today`, `tomorrow`, as above). On a weekend it uses the
  schedule's weekend list. A weekend is the last two weekdays of the calendar's week, and a
  calendar with fewer than three weekdays has none.
- With no clock, it answers nothing.

The schedule is read as the zones hold it now: a zone has no date of its own, so a past hour is
placed by today's schedule, not the one the member kept then. `main` and `at`, the presences, are
unchanged.

## Not yet built

Weather settings (`kinds`, `outdoorPenalty`, `byRegion`) are held: the weather picks among the
kinds the weather slot declares, and a routine has nowhere to keep settings yet.
