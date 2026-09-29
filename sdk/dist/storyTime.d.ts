/**
 * Story time as a stored value — the free-form rung of the story calendar.
 *
 * A **story time** is a position on a book's own calendar: a year, and
 * optionally a month, a day and a time of day. It is what a clock/date stat
 * (`core:stat-shape/story-time@1`) holds, and what a birthdate slot is read
 * as when age is derived.
 *
 * ## Why text, and why this one spelling
 *
 * A stored attribute value is a scalar (`SlotScalar`), so a story time is
 * stored as one canonical line — `412-03-05 22:30` — and parsed back into its
 * parts wherever it is read. The spelling is the one the host already read
 * birthdates in (`412`, `412-03`, `412-03-05`), with a time of day added.
 *
 * Parts, validated beyond shape only against a book's **declared calendar**
 * (`StoryCalendar`, below) when it has one; with none the book is
 * **free-form** — no month lengths, no rollover, no origin. The story-time design (DESIGN-story-time) stores a signed
 * **instant** once a book has a real calendar; when that rung is built the
 * shape moves to `@2` rather than reinterpreting what `@1` stored.
 *
 * ## One comparator
 *
 * `compareStoryTimes` is THE ordering of story times — element-wise, so it is
 * correct for any magnitude (a book numbering "day 250 of year 3" is ordinary
 * free-form practice) and for negative years. Never pack the parts into one
 * number to sort on: a radix packing collides once a part passes its radix,
 * which is the bug the host's `compareDates` was rewritten to fix. The host's
 * lorebook dates delegate here, so one calendar has one comparator.
 */
/** A position on the story calendar. An absent part is one the author did not give. @experimental */
export interface StoryTime {
    year: number;
    month?: number | null;
    day?: number | null;
    /** 0–23. */
    hour?: number | null;
    /** 0–59; read only beside an hour. */
    minute?: number | null;
}
/**
 * The story time a stored value spells, or `null` when it spells none.
 *
 * A number is a bare year (the oldest spelling a birthdate was ever typed
 * in); a string is the canonical line, trimmed. Anything else — and a month,
 * day, hour or minute out of its range — is not a story time.
 * @experimental
 */
export declare function parseStoryTime(value: unknown): StoryTime | null;
/**
 * The canonical line a story time is stored as — `412-03-05 22:30`.
 *
 * A day is only spelled beside a month (`412--05` is not a line anybody could
 * read back), and a minute only beside an hour.
 * @experimental
 */
export declare function storyTimeText(time: StoryTime): string;
/**
 * Which of two story times comes first — **the ordering key; sort with this.**
 *
 * Element-wise. An absent month or day is 0 and an absent hour or minute is
 * -1, so each sorts BEFORE a present one: "Year 2" is the whole year and
 * comes before "Year 2, Mo. 5" inside it, and a date with no time comes
 * before midnight on it.
 * @experimental
 */
export declare function compareStoryTimes(a: StoryTime, b: StoryTime): number;
/**
 * A story time as a person reads it.
 *
 * With no calendar — **free-form**, the bottom rung and every book's default —
 * `Year 412, Mo. 3, Day 5, 22:30`, exactly today's spelling (the story-time
 * design's open decision #4, non-negotiable). With a declared calendar the same
 * parts are spelled through it: `Moonday, 5 Thaw, Year 412 AR, 22:30`.
 *
 * ⚠ A date the calendar cannot place (month 13 of twelve) is spelled
 * free-form rather than guessed at. Dates are validated at entry once a book
 * declares a calendar, so this is the fallback for a row that predates it,
 * never an ordinary path.
 * @experimental
 */
export declare function formatStoryTime(time: StoryTime, calendar?: StoryCalendar | null): string;
/**
 * One month of a declared story calendar, in order.
 * @experimental
 */
export interface StoryMonth {
    name: string;
    /** Its length in an ordinary year. */
    days: number;
}
/**
 * How a year is spelled from a point on: `AR` from year 1, `BR` before it.
 *
 * ⚠ **An era is a spelling, never an ordering.** The stored year is one
 * continuous count (year 0 is the year before year 1, -299 three hundred
 * before that); an era only decides how that count is written. So changing
 * an era re-labels every date and moves none.
 * @experimental
 */
export interface StoryEra {
    name: string;
    /** The first stored year it spells. `null` only for the first era: every year before the next one. */
    start: number | null;
    /**
     * Counts DOWN towards the next era's start — `300 BR, 299 BR, … 1 BR`, then
     * the next era. Needs a next era, so the last one can never count down.
     */
    backwards?: boolean;
}
/**
 * One extra day in one month, every `every` years (a year divisible by it).
 * @experimental
 */
export interface StoryLeapRule {
    every: number;
    /** 1-based. */
    month: number;
}
/**
 * A book's declared calendar — the rung above free-form.
 *
 * Data, not code: it is stored on the lorebook, exported with it, and edited in
 * the book's settings. `null` wherever a calendar is taken means free-form.
 *
 * ⚠ **A calendar spells and steps; it never orders.** `compareStoryTimes` takes
 * no calendar: with parts validated at entry against month lengths, the
 * element-wise order IS the order of days, so there is still one comparator.
 * @experimental
 */
export interface StoryCalendar {
    months: StoryMonth[];
    /** Weekday names in order; absent or empty = no week. */
    weekdays?: string[];
    /** Which weekday (0-based) Year 1, month 1, day 1 falls on. Default 0. */
    firstWeekday?: number;
    /** The word before a year number — `Year` when absent; `''` spells the bare number. */
    yearLabel?: string;
    leap?: StoryLeapRule | null;
    /** In order of `start`; absent or empty = the bare year. */
    eras?: StoryEra[];
}
/**
 * What is wrong with a calendar, one sentence per fault; empty when nothing is.
 *
 * Refuses rather than repairs: a calendar that silently dropped a nameless
 * month would renumber every month after it.
 * @experimental
 */
export declare function storyCalendarProblems(calendar: unknown): string[];
/**
 * A stored calendar value, checked: `null` for free-form, the calendar for a
 * well-formed one, and a thrown error naming every fault otherwise. The copy
 * carries only the declared keys.
 * @experimental
 */
export declare function parseStoryCalendar(value: unknown): StoryCalendar | null;
/**
 * How many days a month has in a given year — its length, plus the leap day
 * when the leap rule names it and the year is a leap year.
 * @experimental
 */
export declare function storyDaysInMonth(year: number, month: number, calendar: StoryCalendar): number;
/**
 * Why a date does not land in a calendar, or `null` when it does. Free-form
 * (`null` calendar) takes any positive parts.
 * @experimental
 */
export declare function storyTimeProblem(time: StoryTime, calendar: StoryCalendar | null | undefined): string | null;
/**
 * Days from Year 1, month 1, day 1 to this date — negative before it; `null`
 * without a full date or for one that does not land.
 *
 * ⚠ A POSITION FOR ARITHMETIC (weekdays), not a stored key and not an
 * ordering: the design's `day_index` column is P2 and not built.
 * @experimental
 */
export declare function storyDayIndex(time: StoryTime, calendar: StoryCalendar): number | null;
/**
 * The date one step after `from` — what "the next date in sequence" is.
 *
 * The step is one more of the FINEST part given, and precision is kept: a
 * year-and-month date steps a month, a year alone steps a year.
 *
 *  - **Free-form** (no calendar): nothing rolls over. Day 31 of month 1 is
 *    followed by day 32 of month 1 — a book numbering days of the year is
 *    ordinary free-form practice.
 *  - **A declared calendar**: a day past its month's length (leap day
 *    included) rolls into day 1 of the next month, and a month past the last
 *    rolls into month 1 of the next year.
 *
 * Always sorts after `from` under `compareStoryTimes`.
 * @experimental
 */
export declare function nextStoryTime(from: StoryTime, calendar?: StoryCalendar | null): {
    year: number;
    month: number | null;
    day: number | null;
};
/**
 * The date a day index names — the inverse of `storyDayIndex` (Year 1,
 * month 1, day 1 is 0; negative before it).
 * @experimental
 */
export declare function storyTimeOfDayIndex(index: number, calendar: StoryCalendar): {
    year: number;
    month: number;
    day: number;
};
/**
 * What a story clock advances by (DESIGN-story-time §5, `advance(n, unit)`).
 * @experimental
 */
export type StoryTimeUnit = 'minutes' | 'hours' | 'days' | 'months' | 'years';
/** @experimental */
export declare const STORY_TIME_UNITS: readonly StoryTimeUnit[];
/**
 * An advance's result: the time it lands on, or the sentence refusing it.
 * @experimental
 */
export type StoryTimeAdvance = {
    time: StoryTime;
    problem?: undefined;
} | {
    time?: undefined;
    problem: string;
};
/**
 * Move a story time by `by` of `unit` — what a clock's `advance(n, unit)` is
 * (DESIGN-story-time P3). Negative `by` goes back.
 *
 * **By a declared calendar** the step carries: minutes into hours into days
 * (a 24-hour day), days through month lengths and the leap day, months into
 * years. **Free-form** has no unit lengths, so a step changes only the part
 * it names — the **smallest-part rule**: forty days on day 31 is day 71 of
 * the same month, and nothing rolls into a month or a year. A time of day
 * carries into the day in both, since a day is always 24 hours.
 *
 * Refused — with a sentence, never clamped — when `by` is not a whole number
 * other than zero (a step of nothing is a silent no-op), when the time has
 * no part for the unit to count (days on a year-only clock; a carry past
 * midnight with no day to carry into), and when the result does not land
 * (Bloom 31 plus a month is Ember 31; before day or month 1 in free-form).
 * A missing time of day reads as the start of the day when stepping by hours
 * or minutes, and stays missing otherwise.
 * @experimental
 */
export declare function advanceStoryTime(from: StoryTime, by: number, unit: StoryTimeUnit, calendar?: StoryCalendar | null): StoryTimeAdvance;
/**
 * The presets the calendar editor starts from (DESIGN-story-time P5). Each is
 * an ordinary declared calendar — a starting point, never a live link.
 * @experimental
 */
export declare const STORY_CALENDAR_PRESETS: ReadonlyArray<{
    id: string;
    name: string;
    calendar: StoryCalendar;
}>;
//# sourceMappingURL=storyTime.d.ts.map