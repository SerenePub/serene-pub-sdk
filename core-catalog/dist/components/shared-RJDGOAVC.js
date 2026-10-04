// ../sdk/dist/hash.js
var sortDeep = (v) => {
  if (Array.isArray(v))
    return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, sortDeep(val)]));
  }
  return v;
};
function canonicalize(v) {
  return JSON.stringify(sortDeep(v));
}
function contentHash(v) {
  const s = canonicalize(v);
  let h1 = 3735928559;
  let h2 = 1103547991;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
var UNIVERSAL_DISPLAY = ["i18n", "description"];
var stripDisplay = (v, display, functions = "source") => {
  if (typeof v === "function")
    return functions === "source" ? `[fn] ${String(v)}` : void 0;
  if (Array.isArray(v))
    return v.map((e) => stripDisplay(e, display, functions));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k, val]) => !display.has(k) && !(functions === "omit" && typeof val === "function")).map(([k, val]) => [k, stripDisplay(val, display, functions)]));
  }
  return v;
};
var DEFAULT_DISPLAY = new Set(UNIVERSAL_DISPLAY);
var displaySet = (opts) => opts?.display?.length ? /* @__PURE__ */ new Set([...UNIVERSAL_DISPLAY, ...opts.display]) : DEFAULT_DISPLAY;
function declarationHash(v, opts) {
  return contentHash(stripDisplay(v, displaySet(opts)));
}
function refuseUnlessIdentical(existing, next, why, opts) {
  refuseUnlessSameHash(declarationHash(existing, opts), declarationHash(next, opts), why);
}
function refuseUnlessSameHash(registered, redeclared, why) {
  if (registered === redeclared)
    return;
  throw new Error(`${why} (registered ${registered}, redeclared ${redeclared})`);
}

// ../sdk/dist/statShapes.js
function statShapeKindOf(field) {
  switch (field?.type) {
    case "integer":
    case "number":
      return "number";
    case "enum":
      return "choice";
    case "boolean":
      return "boolean";
    case "string":
    case "text":
      return field.format === "story-time" ? "story-time" : field.format === void 0 ? "text" : void 0;
    case "list": {
      const item = field.item;
      if (!item)
        return "list";
      if ((item.type === "string" || item.type === "text") && item.format === void 0)
        return "list";
      if (item.type === "enum")
        return "list";
      return void 0;
    }
    default:
      return void 0;
  }
}

// ../sdk/dist/storyTime.js
var STORY_TIME_PART_RANGES = {
  month: { min: 1 },
  day: { min: 1 },
  hour: { min: 0, max: 23 },
  minute: { min: 0, max: 59 }
};
var RANGE = STORY_TIME_PART_RANGES;
var STORY_TIME = /^\s*(-?\d+)(?:-(\d+))?(?:-(\d+))?(?:[ T](\d{1,2}):(\d{2}))?\s*$/;
function parseStoryTime(value) {
  if (typeof value === "number")
    return Number.isInteger(value) ? { year: value } : null;
  if (typeof value !== "string")
    return null;
  const m = STORY_TIME.exec(value);
  if (!m)
    return null;
  const out = { year: Number(m[1]) };
  if (m[2] !== void 0) {
    const month = Number(m[2]);
    if (month < RANGE.month.min)
      return null;
    out.month = month;
  }
  if (m[3] !== void 0) {
    const day = Number(m[3]);
    if (day < RANGE.day.min)
      return null;
    out.day = day;
  }
  if (m[4] !== void 0) {
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    if (hour > RANGE.hour.max || minute > RANGE.minute.max)
      return null;
    out.hour = hour;
    out.minute = minute;
  }
  return out;
}
var pad = (n) => String(n).padStart(2, "0");
var has = (n) => typeof n === "number" && Number.isFinite(n);
function storyTimeText(time) {
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
function formatStoryTime(time, calendar) {
  const clock = has(time.hour) ? `, ${pad(time.hour)}:${pad(has(time.minute) ? time.minute : 0)}` : "";
  if (calendar && storyTimeProblem(time, calendar) === null) {
    const year = storyYearText(time.year, calendar);
    if (!has(time.month))
      return year + clock;
    const month = calendar.months[time.month - 1].name;
    if (!has(time.day))
      return `${month}, ${year}${clock}`;
    const weekday = storyWeekdayOf(time, calendar);
    return `${weekday ? `${weekday}, ` : ""}${time.day} ${month}, ${year}${clock}`;
  }
  let out = `Year ${Math.trunc(time.year)}`;
  if (has(time.month) && time.month)
    out += `, Mo. ${time.month}`;
  if (has(time.day) && time.day)
    out += `, Day ${time.day}`;
  return out + clock;
}
var isInt = (n) => typeof n === "number" && Number.isInteger(n);
var floorDiv = (a, b) => Math.floor(a / b);
var mod = (a, b) => (a % b + b) % b;
var isLeapYear = (year, calendar) => !!calendar.leap && mod(year, calendar.leap.every) === 0;
function storyDaysInMonth(year, month, calendar) {
  const base = calendar.months[month - 1]?.days ?? 0;
  return base + (calendar.leap?.month === month && isLeapYear(year, calendar) ? 1 : 0);
}
function storyTimeProblem(time, calendar) {
  if (!isInt(time.year))
    return "A date needs a whole year.";
  if (has(time.month) && (!isInt(time.month) || time.month < RANGE.month.min))
    return `A month is a whole number, ${RANGE.month.min} or more.`;
  if (has(time.day) && (!isInt(time.day) || time.day < RANGE.day.min))
    return `A day is a whole number, ${RANGE.day.min} or more.`;
  if (has(time.day) && !has(time.month))
    return "A day needs a month.";
  if (has(time.hour) && (!isInt(time.hour) || time.hour < RANGE.hour.min || time.hour > RANGE.hour.max))
    return `An hour is a whole number, ${RANGE.hour.min} to ${RANGE.hour.max}.`;
  if (has(time.minute)) {
    if (!has(time.hour))
      return "A minute needs an hour.";
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
function storyDayIndex(time, calendar) {
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
  const label = calendar.yearLabel ?? "Year";
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
var WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
var STORY_CALENDAR_PRESETS = [
  {
    id: "twelve-months",
    name: "Twelve months, 365 days",
    calendar: {
      months: [
        { name: "January", days: 31 },
        { name: "February", days: 28 },
        { name: "March", days: 31 },
        { name: "April", days: 30 },
        { name: "May", days: 31 },
        { name: "June", days: 30 },
        { name: "July", days: 31 },
        { name: "August", days: 31 },
        { name: "September", days: 30 },
        { name: "October", days: 31 },
        { name: "November", days: 30 },
        { name: "December", days: 31 }
      ],
      weekdays: WEEK,
      firstWeekday: 0,
      yearLabel: "Year",
      leap: { every: 4, month: 2 }
    }
  },
  {
    id: "thirty-day-months",
    name: "Twelve months of thirty days",
    calendar: {
      months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
      yearLabel: "Year"
    }
  }
];

// ../sdk/dist/attributes.js
var derivations = Object.freeze({
  /**
   * How old someone is: a `birthdate` value on the same owner, against the
   * session's story date. Absent — not zero — when either is missing, which
   * is the whole reason age is derived and not typed in.
   */
  age: Object.freeze({
    id: "core:derive/age@1",
    requiresFrom: true,
    description: "A birthdate slot on the same owner, read against the session's story date."
  }),
  /**
   * A LiquidJS expression written on the declaration itself (`derive`),
   * evaluated over the state pinned at run start.
   *
   * It earns an id even though the *text* is the author's, because a derived
   * slot always names the computation behind it: a receipt says which one
   * produced a number, and "an expression" is an answer only if it is one
   * declared thing rather than a hole in the set. What the author supplies is
   * the expression; the evaluator is still core's.
   *
   * `requiresFrom: false` — the expression names whatever it reads, which is
   * exactly the reason it is not `age`.
   */
  liquid: Object.freeze({
    id: "core:derive/liquid@1",
    requiresFrom: false,
    description: "A LiquidJS expression on the declaration, evaluated over the state pinned at run start."
  })
});
var isSlotLoreRef = (item) => !!item && typeof item === "object" && !Array.isArray(item) && Number.isInteger(item.entryId) && item.entryId > 0;
var slotLoreRefCount = (ref) => typeof ref.count === "number" ? ref.count : 1;
function heldCountIn(value, entryId) {
  if (!Array.isArray(value))
    return 0;
  let held = 0;
  for (const item of value)
    if (isSlotLoreRef(item) && item.entryId === entryId)
      held += slotLoreRefCount(item);
  return held;
}
function slotListItemText(item) {
  if (isSlotLoreRef(item)) {
    const title = item.name?.trim() || `entry ${item.entryId}`;
    const count = slotLoreRefCount(item);
    return count > 1 ? `${title} \xD7${count}` : title;
  }
  if (item === null)
    return "cleared";
  if (typeof item === "boolean")
    return item ? "on" : "off";
  return String(item);
}
function slotValueForStorage(value) {
  if (isSlotLoreRef(value))
    return { entryId: value.entryId };
  if (!Array.isArray(value))
    return value;
  return value.map((item) => isSlotLoreRef(item) ? (
    // One held is stored bare (phase 4): `count: 1` and no count are
    // one value, and it has one spelling on disk.
    item.count === void 0 || item.count === 1 ? { entryId: item.entryId } : { entryId: item.entryId, count: item.count }
  ) : item);
}
var listItemKey = (item) => isSlotLoreRef(item) ? `entry:${item.entryId}` : `${typeof item}:${String(item)}`;
var SLOT_EARSHOTS = Object.freeze(["all", "holder"]);
function fieldForSlotType(type) {
  switch (type) {
    case "integer":
      return { type: "integer" };
    case "enum":
      return { type: "enum" };
    case "list":
      return { type: "list", item: { type: "string" } };
    case "text":
      return { type: "text" };
    case "boolean":
      return { type: "boolean" };
    case "derived":
      return void 0;
  }
}
function applyListOp(current, op, items, config = {}) {
  const held = current ?? [];
  const unique = config.unique !== false;
  const dedup = (list) => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const item of list) {
      if (!unique && !isSlotLoreRef(item)) {
        out.push(item);
        continue;
      }
      const key = listItemKey(item);
      if (seen.has(key))
        continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };
  const withCount = (ref, count) => ({
    entryId: ref.entryId,
    ...count === 1 ? {} : { count },
    ...ref.name === void 0 ? {} : { name: ref.name }
  });
  let next;
  switch (op) {
    case "set":
      next = dedup(items);
      break;
    case "add": {
      const out = [...held];
      const rest = [];
      for (const item of items) {
        if (!isSlotLoreRef(item) || item.count === void 0) {
          rest.push(item);
          continue;
        }
        const at = out.findIndex((h) => isSlotLoreRef(h) && h.entryId === item.entryId);
        if (at < 0)
          out.push(withCount(item, item.count));
        else
          out[at] = withCount(out[at], slotLoreRefCount(out[at]) + item.count);
      }
      next = dedup([...out, ...rest]);
      break;
    }
    case "remove": {
      const out = new Set(items.filter((item) => !isSlotLoreRef(item) || item.count === void 0).map(listItemKey));
      const less = /* @__PURE__ */ new Map();
      for (const item of items)
        if (isSlotLoreRef(item) && item.count !== void 0)
          less.set(item.entryId, (less.get(item.entryId) ?? 0) + item.count);
      next = held.flatMap((item) => {
        if (out.has(listItemKey(item)))
          return [];
        if (!isSlotLoreRef(item) || !less.has(item.entryId))
          return [item];
        const left = slotLoreRefCount(item) - less.get(item.entryId);
        return left > 0 ? [withCount(item, left)] : [];
      });
      break;
    }
  }
  if (typeof config.maxItems === "number" && next.length > config.maxItems)
    return {
      value: Object.freeze([...held]),
      refusal: `this list holds at most ${config.maxItems} item${config.maxItems === 1 ? "" : "s"}, and that would make it ${next.length}. Take something out first \u2014 nothing was dropped to make room.`
    };
  return { value: Object.freeze(next), refusal: null };
}

export {
  refuseUnlessIdentical,
  statShapeKindOf,
  parseStoryTime,
  storyTimeText,
  formatStoryTime,
  isSlotLoreRef,
  slotLoreRefCount,
  heldCountIn,
  slotListItemText,
  slotValueForStorage,
  fieldForSlotType,
  applyListOp
};
