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
/**
 * The range each part of a story time takes on EVERY rung of the calendar —
 * the free-form rule, and the one validity definition for a stored date.
 *
 * A declared calendar only ever narrows it (month count, month lengths, the
 * leap day — `storyTimeProblem`); nothing widens it. `parseStoryTime`,
 * `storyTimeProblem` and core's history entry type all read these, and the
 * entry type's declared range is projected into the database's CHECK — so a
 * date a book's calendar allows is a date the database holds (A15, 2026-09-30:
 * a copied 1–12 / 1–31 once refused month 13 of a thirteen-month calendar and
 * the day after a free-form day 31).
 *
 * ⚠ **Month and day have a floor and no ceiling, on purpose.** A free-form
 * book numbers days of the year ("Year 3, day 250") and may count as many
 * months as it likes; a declared calendar may have any number of months of up
 * to 1000 days each. Those are facts about ONE book, checked against its
 * calendar at entry — never a bound on every book. Zero is refused because it
 * is what an absent part packs to. The year has no range at all: it is one
 * signed count, negative before year 1.
 *
 * Not the calendar's own limits (`storyCalendarProblems`: a month's LENGTH is
 * 1–1000 days) — those bound a calendar's shape, not a date. And ranges only:
 * the narrowing rule (a day needs a month, a minute needs an hour) is
 * `storyTimeProblem`'s, which reads these for every part and is the check
 * every dated writer answers with.
 * @experimental
 */
export const STORY_TIME_PART_RANGES = {
    month: { min: 1 },
    day: { min: 1 },
    hour: { min: 0, max: 23 },
    minute: { min: 0, max: 59 },
};
const RANGE = STORY_TIME_PART_RANGES;
// `-12-03-05 06:30`: a signed year, then month and day, then an optional time.
// Month and day are unbounded above on purpose (`STORY_TIME_PART_RANGES`).
const STORY_TIME = /^\s*(-?\d+)(?:-(\d+))?(?:-(\d+))?(?:[ T](\d{1,2}):(\d{2}))?\s*$/;
/**
 * The story time a stored value spells, or `null` when it spells none.
 *
 * A number is a bare year (the oldest spelling a birthdate was ever typed
 * in); a string is the canonical line, trimmed. Anything else — and a month,
 * day, hour or minute out of its range — is not a story time.
 * @experimental
 */
export function parseStoryTime(value) {
    if (typeof value === 'number')
        return Number.isInteger(value) ? { year: value } : null;
    if (typeof value !== 'string')
        return null;
    const m = STORY_TIME.exec(value);
    if (!m)
        return null;
    const out = { year: Number(m[1]) };
    if (m[2] !== undefined) {
        const month = Number(m[2]);
        if (month < RANGE.month.min)
            return null;
        out.month = month;
    }
    if (m[3] !== undefined) {
        const day = Number(m[3]);
        if (day < RANGE.day.min)
            return null;
        out.day = day;
    }
    if (m[4] !== undefined) {
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        if (hour > RANGE.hour.max || minute > RANGE.minute.max)
            return null;
        out.hour = hour;
        out.minute = minute;
    }
    return out;
}
const pad = (n) => String(n).padStart(2, '0');
const has = (n) => typeof n === 'number' && Number.isFinite(n);
/**
 * The canonical line a story time is stored as — `412-03-05 22:30`.
 *
 * A day is only spelled beside a month (`412--05` is not a line anybody could
 * read back), and a minute only beside an hour.
 * @experimental
 */
export function storyTimeText(time) {
    let out = String(Math.trunc(time.year));
    if (has(time.month)) {
        out += `-${pad(time.month)}`;
        if (has(time.day))
            out += `-${pad(time.day)}`;
    }
    if (has(time.hour))
        out += ` ${pad(time.hour)}:${pad(has(time.minute) ? time.minute : 0)}`;
    return out;
}
/**
 * Which of two story times comes first — **the ordering key; sort with this.**
 *
 * Element-wise. An absent month or day is 0 and an absent hour or minute is
 * -1, so each sorts BEFORE a present one: "Year 2" is the whole year and
 * comes before "Year 2, Mo. 5" inside it, and a date with no time comes
 * before midnight on it.
 * @experimental
 */
export function compareStoryTimes(a, b) {
    const part = (v, absent) => (has(v) ? v : absent);
    return (a.year - b.year ||
        part(a.month, 0) - part(b.month, 0) ||
        part(a.day, 0) - part(b.day, 0) ||
        part(a.hour, -1) - part(b.hour, -1) ||
        part(a.minute, -1) - part(b.minute, -1));
}
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
export function formatStoryTime(time, calendar) {
    const clock = has(time.hour) ? `, ${pad(time.hour)}:${pad(has(time.minute) ? time.minute : 0)}` : '';
    if (calendar && storyTimeProblem(time, calendar) === null) {
        const year = storyYearText(time.year, calendar);
        if (!has(time.month))
            return year + clock;
        const month = calendar.months[time.month - 1].name;
        if (!has(time.day))
            return `${month}, ${year}${clock}`;
        const weekday = storyWeekdayOf(time, calendar);
        return `${weekday ? `${weekday}, ` : ''}${time.day} ${month}, ${year}${clock}`;
    }
    let out = `Year ${Math.trunc(time.year)}`;
    if (has(time.month) && time.month)
        out += `, Mo. ${time.month}`;
    if (has(time.day) && time.day)
        out += `, Day ${time.day}`;
    return out + clock;
}
const isInt = (n) => typeof n === 'number' && Number.isInteger(n);
const floorDiv = (a, b) => Math.floor(a / b);
const mod = (a, b) => ((a % b) + b) % b;
/**
 * What is wrong with a calendar, one sentence per fault; empty when nothing is.
 *
 * Refuses rather than repairs: a calendar that silently dropped a nameless
 * month would renumber every month after it.
 * @experimental
 */
export function storyCalendarProblems(calendar) {
    const out = [];
    const c = calendar;
    if (!c || typeof c !== 'object')
        return ['A calendar must be an object.'];
    if (!Array.isArray(c.months) || c.months.length === 0)
        out.push('A calendar needs at least one month.');
    else
        c.months.forEach((m, i) => {
            if (!m || typeof m.name !== 'string' || !m.name.trim())
                out.push(`Month ${i + 1} needs a name.`);
            if (!m || !isInt(m.days) || m.days < 1 || m.days > 1000)
                out.push(`Month ${i + 1} needs a length of 1 to 1000 days.`);
        });
    if (c.weekdays !== undefined) {
        if (!Array.isArray(c.weekdays))
            out.push('Weekdays must be a list of names.');
        else if (c.weekdays.some((w) => typeof w !== 'string' || !w.trim()))
            out.push('Every weekday needs a name.');
    }
    if (c.firstWeekday !== undefined) {
        const n = Array.isArray(c.weekdays) ? c.weekdays.length : 0;
        if (!isInt(c.firstWeekday) || c.firstWeekday < 0 || (n > 0 && c.firstWeekday >= n) || (n === 0 && c.firstWeekday !== 0))
            out.push('The first weekday must be one of the weekdays.');
    }
    if (c.yearLabel !== undefined && (typeof c.yearLabel !== 'string' || c.yearLabel.length > 40))
        out.push('The year label must be text of at most 40 characters.');
    if (c.leap != null) {
        const months = Array.isArray(c.months) ? c.months.length : 0;
        if (!isInt(c.leap.every) || c.leap.every < 1)
            out.push('A leap rule needs a whole number of years, 1 or more.');
        if (!isInt(c.leap.month) || c.leap.month < 1 || c.leap.month > months)
            out.push('A leap rule must name one of the months.');
    }
    if (c.eras !== undefined) {
        if (!Array.isArray(c.eras))
            out.push('Eras must be a list.');
        else
            c.eras.forEach((e, i) => {
                if (!e || typeof e.name !== 'string' || !e.name.trim())
                    out.push(`Era ${i + 1} needs a name.`);
                if (e?.start === null) {
                    if (i !== 0)
                        out.push(`Only the first era may have no start (era ${i + 1}).`);
                }
                else if (!isInt(e?.start))
                    out.push(`Era ${i + 1} needs a start year.`);
                else if (i > 0) {
                    const prev = c.eras[i - 1]?.start;
                    if (isInt(prev) && e.start <= prev)
                        out.push(`Era ${i + 1} must start after era ${i}.`);
                }
                if (e?.backwards && i === c.eras.length - 1)
                    out.push(`Era ${i + 1} counts down, so another era must follow it.`);
            });
    }
    return out;
}
/**
 * A stored calendar value, checked: `null` for free-form, the calendar for a
 * well-formed one, and a thrown error naming every fault otherwise. The copy
 * carries only the declared keys.
 * @experimental
 */
export function parseStoryCalendar(value) {
    if (value === null || value === undefined)
        return null;
    const problems = storyCalendarProblems(value);
    if (problems.length)
        throw new Error(problems.join(' '));
    const c = value;
    const out = { months: c.months.map((m) => ({ name: m.name.trim(), days: m.days })) };
    if (c.weekdays !== undefined)
        out.weekdays = c.weekdays.map((w) => w.trim());
    if (c.firstWeekday !== undefined)
        out.firstWeekday = c.firstWeekday;
    if (c.yearLabel !== undefined)
        out.yearLabel = c.yearLabel;
    if (c.leap != null)
        out.leap = { every: c.leap.every, month: c.leap.month };
    if (c.eras !== undefined)
        out.eras = c.eras.map((e) => ({ name: e.name.trim(), start: e.start, ...(e.backwards ? { backwards: true } : {}) }));
    return out;
}
const isLeapYear = (year, calendar) => !!calendar.leap && mod(year, calendar.leap.every) === 0;
/**
 * How many days a month has in a given year — its length, plus the leap day
 * when the leap rule names it and the year is a leap year.
 * @experimental
 */
export function storyDaysInMonth(year, month, calendar) {
    const base = calendar.months[month - 1]?.days ?? 0;
    return base + (calendar.leap?.month === month && isLeapYear(year, calendar) ? 1 : 0);
}
/**
 * Why a date does not land in a calendar, or `null` when it does.
 *
 * **Every rung** holds a story time to `STORY_TIME_PART_RANGES` and to the
 * narrowing rule — a day needs a month, a minute needs an hour — so free-form
 * (`null` calendar) takes any whole parts in range and no more. A declared
 * calendar then narrows further: its month count, its month lengths, the leap
 * day. This is the one check every dated writer answers with (history,
 * amendments, fork dates, placements, clocks): one rule, one sentence.
 * @experimental
 */
export function storyTimeProblem(time, calendar) {
    if (!isInt(time.year))
        return 'A date needs a whole year.';
    if (has(time.month) && (!isInt(time.month) || time.month < RANGE.month.min))
        return `A month is a whole number, ${RANGE.month.min} or more.`;
    if (has(time.day) && (!isInt(time.day) || time.day < RANGE.day.min))
        return `A day is a whole number, ${RANGE.day.min} or more.`;
    if (has(time.day) && !has(time.month))
        return 'A day needs a month.';
    if (has(time.hour) && (!isInt(time.hour) || time.hour < RANGE.hour.min || time.hour > RANGE.hour.max))
        return `An hour is a whole number, ${RANGE.hour.min} to ${RANGE.hour.max}.`;
    if (has(time.minute)) {
        if (!has(time.hour))
            return 'A minute needs an hour.';
        if (!isInt(time.minute) || time.minute < RANGE.minute.min || time.minute > RANGE.minute.max)
            return `A minute is a whole number, ${RANGE.minute.min} to ${RANGE.minute.max}.`;
    }
    if (!calendar)
        return null;
    if (has(time.month) && time.month > calendar.months.length)
        return `There is no month ${time.month}: this calendar has ${calendar.months.length}.`;
    if (has(time.day) && has(time.month)) {
        const days = storyDaysInMonth(time.year, time.month, calendar);
        if (time.day > days)
            return `${calendar.months[time.month - 1].name} has ${days} days in year ${time.year}, not ${time.day}.`;
    }
    return null;
}
/**
 * Days from Year 1, month 1, day 1 to this date — negative before it; `null`
 * without a full date or for one that does not land.
 *
 * ⚠ A POSITION FOR ARITHMETIC (weekdays), not a stored key and not an
 * ordering: the design's `day_index` column is P2 and not built.
 * @experimental
 */
export function storyDayIndex(time, calendar) {
    if (!has(time.month) || !has(time.day) || storyTimeProblem(time, calendar))
        return null;
    const yearDays = calendar.months.reduce((n, m) => n + m.days, 0);
    const y = time.year - 1;
    let days = y * yearDays + (calendar.leap ? floorDiv(y, calendar.leap.every) : 0);
    for (let m = 1; m < time.month; m++)
        days += storyDaysInMonth(time.year, m, calendar);
    return days + time.day - 1;
}
function storyWeekdayOf(time, calendar) {
    const week = calendar.weekdays ?? [];
    if (!week.length)
        return null;
    const index = storyDayIndex(time, calendar);
    return index === null ? null : week[mod(index + (calendar.firstWeekday ?? 0), week.length)];
}
function storyYearText(year, calendar) {
    const label = calendar.yearLabel ?? 'Year';
    const eras = calendar.eras ?? [];
    let spelled = String(year);
    for (let i = eras.length - 1; i >= 0; i--) {
        const era = eras[i];
        if (era.start !== null && year < era.start)
            continue;
        const next = eras[i + 1]?.start;
        const n = era.backwards && isInt(next) ? next - year : era.start === null ? year : year - era.start + 1;
        spelled = `${n} ${era.name}`;
        break;
    }
    return label ? `${label} ${spelled}` : spelled;
}
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
export function nextStoryTime(from, calendar) {
    const month = has(from.month) ? from.month : null;
    const day = has(from.day) ? from.day : null;
    if (!calendar) {
        if (day !== null)
            return { year: from.year, month, day: day + 1 };
        if (month !== null)
            return { year: from.year, month: month + 1, day: null };
        return { year: from.year + 1, month: null, day: null };
    }
    const months = calendar.months.length;
    if (day !== null && month !== null) {
        if (day < storyDaysInMonth(from.year, month, calendar))
            return { year: from.year, month, day: day + 1 };
        if (month < months)
            return { year: from.year, month: month + 1, day: 1 };
        return { year: from.year + 1, month: 1, day: 1 };
    }
    if (month !== null) {
        if (month < months)
            return { year: from.year, month: month + 1, day: null };
        return { year: from.year + 1, month: 1, day: null };
    }
    return { year: from.year + 1, month: null, day: null };
}
/**
 * The date a day index names — the inverse of `storyDayIndex` (Year 1,
 * month 1, day 1 is 0; negative before it).
 * @experimental
 */
export function storyTimeOfDayIndex(index, calendar) {
    const yearDays = calendar.months.reduce((n, m) => n + m.days, 0);
    const average = yearDays + (calendar.leap ? 1 / calendar.leap.every : 0);
    const startOf = (year) => storyDayIndex({ year, month: 1, day: 1 }, calendar);
    // An estimate by the average year, then corrected: at most a step or two.
    let year = Math.floor(index / average) + 1;
    while (startOf(year) > index)
        year--;
    while (startOf(year + 1) <= index)
        year++;
    let rest = index - startOf(year);
    let month = 1;
    while (rest >= storyDaysInMonth(year, month, calendar)) {
        rest -= storyDaysInMonth(year, month, calendar);
        month++;
    }
    return { year, month, day: rest + 1 };
}
/** @experimental */
export const STORY_TIME_UNITS = ['minutes', 'hours', 'days', 'months', 'years'];
/** A time with only the parts present — never a null key. */
function partsOf(t) {
    const out = { year: t.year };
    if (has(t.month))
        out.month = t.month;
    if (has(t.month) && has(t.day))
        out.day = t.day;
    if (has(t.hour)) {
        out.hour = t.hour;
        out.minute = has(t.minute) ? t.minute : 0;
    }
    return out;
}
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
export function advanceStoryTime(from, by, unit, calendar) {
    if (!isInt(by) || by === 0)
        return { problem: 'Advance by a whole number other than zero.' };
    if (!STORY_TIME_UNITS.includes(unit))
        return { problem: `Advance by one of ${STORY_TIME_UNITS.join(', ')} — not "${String(unit)}".` };
    const start = partsOf(from);
    const landing = storyTimeProblem(start, calendar);
    if (landing)
        return { problem: `The clock does not land: ${landing}` };
    const spelled = formatStoryTime(start, calendar);
    const out = { ...start };
    const stepDays = (days) => {
        if (days === 0)
            return null;
        if (!has(out.month) || !has(out.day))
            return `The clock stands at ${spelled}, with no day to count days from.`;
        if (calendar) {
            const moved = storyTimeOfDayIndex(storyDayIndex(out, calendar) + days, calendar);
            out.year = moved.year;
            out.month = moved.month;
            out.day = moved.day;
            return null;
        }
        out.day = out.day + days;
        return out.day < 1
            ? 'That lands before day 1 of the month, and a free-form book has no month lengths to count back through.'
            : null;
    };
    let problem = null;
    if (unit === 'minutes' || unit === 'hours') {
        const total = (has(out.hour) ? out.hour : 0) * 60 + (has(out.minute) ? out.minute : 0) + by * (unit === 'hours' ? 60 : 1);
        out.hour = floorDiv(mod(total, 1440), 60);
        out.minute = mod(total, 60);
        problem = stepDays(floorDiv(total, 1440));
    }
    else if (unit === 'days')
        problem = stepDays(by);
    else if (unit === 'months') {
        if (!has(out.month))
            return { problem: `The clock stands at ${spelled}, with no month to count months from.` };
        if (calendar) {
            const count = calendar.months.length;
            const index = out.year * count + (out.month - 1) + by;
            out.year = floorDiv(index, count);
            out.month = mod(index, count) + 1;
        }
        else {
            out.month = out.month + by;
            if (out.month < 1)
                problem = 'That lands before month 1, and a free-form book has no year lengths to count back through.';
        }
    }
    else
        out.year = out.year + by;
    if (problem)
        return { problem };
    const lands = storyTimeProblem(out, calendar);
    if (lands)
        return { problem: `${by > 0 ? 'Advancing' : 'Going back'} ${Math.abs(by)} ${unit} does not land: ${lands}` };
    return { time: partsOf(out) };
}
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/**
 * The presets the calendar editor starts from (DESIGN-story-time P5). Each is
 * an ordinary declared calendar — a starting point, never a live link.
 * @experimental
 */
export const STORY_CALENDAR_PRESETS = [
    {
        id: 'twelve-months',
        name: 'Twelve months, 365 days',
        calendar: {
            months: [
                { name: 'January', days: 31 },
                { name: 'February', days: 28 },
                { name: 'March', days: 31 },
                { name: 'April', days: 30 },
                { name: 'May', days: 31 },
                { name: 'June', days: 30 },
                { name: 'July', days: 31 },
                { name: 'August', days: 31 },
                { name: 'September', days: 30 },
                { name: 'October', days: 31 },
                { name: 'November', days: 30 },
                { name: 'December', days: 31 },
            ],
            weekdays: WEEK,
            firstWeekday: 0,
            yearLabel: 'Year',
            leap: { every: 4, month: 2 },
        },
    },
    {
        id: 'thirty-day-months',
        name: 'Twelve months of thirty days',
        calendar: {
            months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
            yearLabel: 'Year',
        },
    },
];
//# sourceMappingURL=storyTime.js.map