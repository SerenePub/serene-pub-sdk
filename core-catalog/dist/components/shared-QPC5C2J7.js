import {
  applyListOp,
  fieldForSlotType,
  formatStoryTime,
  heldCountIn,
  isSlotLoreRef,
  parseStoryTime,
  slotListItemText,
  slotLoreRefCount,
  slotValueForStorage,
  statShapeKindOf,
  storyTimeText
} from "./shared-YMXNAZGX.js";

// dist/ui/sessions/session-state/barMath.js
var finite = (v) => typeof v === "number" && Number.isFinite(v);
function barView(value, config) {
  const { min, max } = config;
  if (!finite(value) || !finite(min) || !finite(max))
    return null;
  if (max <= min)
    return null;
  const span = max - min;
  const percent = Math.min(100, Math.max(0, (value - min) / span * 100));
  return { min, max, value, percent, label: `${value}/${max}` };
}
function clampToBounds(value, config) {
  let out = value;
  if (finite(config.min))
    out = Math.max(config.min, out);
  if (finite(config.max))
    out = Math.min(config.max, out);
  return out;
}
function formatSlotValue(value) {
  if (value === null)
    return "cleared";
  if (value === void 0)
    return "";
  if (typeof value === "boolean")
    return value ? "on" : "off";
  if (Array.isArray(value))
    return value.map((item) => slotListItemText(item)).join(", ");
  if (isSlotLoreRef(value))
    return slotListItemText(value);
  return String(value);
}

// dist/ui/sessions/session-state/shapes.js
var slotFieldOf = (slot) => slot.type === "derived" ? void 0 : slot.field ?? fieldForSlotType(slot.type);
function slotKind(slot) {
  if (slot.type === "derived")
    return "derived";
  return statShapeKindOf(slotFieldOf(slot)) ?? "text";
}
var slotIsWhole = (slot) => slotFieldOf(slot)?.type !== "number";
function numberDraftFor(draft, config, whole) {
  if (draft === null || draft === void 0 || typeof draft === "string" && draft.trim() === "")
    return null;
  const n = Number(draft);
  if (!Number.isFinite(n))
    return void 0;
  return clampToBounds(whole ? Math.trunc(n) : n, config);
}
function listItemsOf(value) {
  if (Array.isArray(value))
    return value;
  if (value === void 0 || value === null)
    return [];
  return [value];
}
function listItemText(item, t = (s) => s) {
  if (isSlotLoreRef(item)) {
    const title = item.name?.trim() || t("Lore entry {id}").replace("{id}", String(item.entryId));
    const count = slotLoreRefCount(item);
    return count > 1 ? `${title} \xD7${count}` : title;
  }
  return formatSlotValue(item);
}
var listItemKeyOf = (item, index) => `${index}:${isSlotLoreRef(item) ? `entry:${item.entryId}` : String(item)}`;
var stored = (items) => slotValueForStorage(items);
function listWithAdded(value, text, config) {
  const item = text.trim();
  if (!item)
    return null;
  const maxLength = config.maxLength;
  const cut = typeof maxLength === "number" && Number.isInteger(maxLength) && maxLength >= 0 ? item.slice(0, maxLength) : item;
  const held = listItemsOf(value);
  const result = applyListOp(held, "add", [cut], config);
  return { value: stored(result.value), refusal: result.refusal };
}
function listWithout(value, index) {
  return stored(listItemsOf(value).filter((_, i) => i !== index));
}
function listMoved(value, index, by) {
  const items = [...listItemsOf(value)];
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length)
    return stored(items);
  const [item] = items.splice(index, 1);
  items.splice(to, 0, item);
  return stored(items);
}
var ITEM_ENTRY_TYPE_ID = "core:entry/item";
var slotTakesLoreRefs = (config) => config.of === void 0;
var listItemRef = (item) => isSlotLoreRef(item) ? item : null;
function pickableEntries(value, pages) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const rows of pages)
    for (const row of rows) {
      if (seen.has(row.id))
        continue;
      seen.add(row.id);
      out.push({
        entryId: row.id,
        title: row.title?.trim() || `#${row.id}`,
        typeId: row.typeId,
        item: row.typeId === ITEM_ENTRY_TYPE_ID,
        held: heldCountIn(listItemsOf(value), row.id)
      });
    }
  return [...out.filter((e) => e.item), ...out.filter((e) => !e.item)];
}
function countDraftFor(draft) {
  if (draft === null || draft === void 0 || typeof draft === "string" && draft.trim() === "")
    return void 0;
  const n = Number(draft);
  return Number.isInteger(n) && n >= 1 ? n : void 0;
}
function listWithRefAdded(value, entryId, count, config) {
  const result = applyListOp(listItemsOf(value), "add", [{ entryId, count }], config);
  return { value: stored(bareOnes(result.value)), refusal: result.refusal };
}
function listWithRefStep(value, entryId, by) {
  const op = by > 0 ? "add" : "remove";
  return stored(bareOnes(applyListOp(listItemsOf(value), op, [{ entryId, count: 1 }]).value));
}
var bareOnes = (items) => items.map((item) => isSlotLoreRef(item) && item.count === 1 ? item.name === void 0 ? { entryId: item.entryId } : { entryId: item.entryId, name: item.name } : item);
function storyTimeDraftOf(value) {
  const time = parseStoryTime(value);
  if (!time)
    return { year: "", month: "", day: "", time: "" };
  const pad = (n) => String(n).padStart(2, "0");
  return {
    year: String(time.year),
    month: time.month ? String(time.month) : "",
    day: time.day ? String(time.day) : "",
    time: typeof time.hour === "number" ? `${pad(time.hour)}:${pad(time.minute ?? 0)}` : ""
  };
}
function storyTimeDraftValue(draft) {
  const field = (v) => v === null || v === void 0 ? "" : String(v).trim();
  const year = field(draft.year);
  const month = field(draft.month);
  const day = field(draft.day);
  const clock = field(draft.time);
  if (!year)
    return null;
  if (day && !month)
    return void 0;
  let line = year;
  if (month)
    line += `-${month}`;
  if (day)
    line += `-${day}`;
  if (clock)
    line += ` ${clock}`;
  const time = parseStoryTime(line);
  return time ? storyTimeText(time) : void 0;
}
function shownValueText(slot, value, t, calendar) {
  if (value === void 0)
    return "";
  if (value === null || typeof value === "boolean")
    return t(formatSlotValue(value));
  const kind = slotKind(slot);
  if (kind === "story-time") {
    const time = parseStoryTime(value);
    return time ? formatStoryTime(time, calendar) : formatSlotValue(value);
  }
  if (kind === "list" || Array.isArray(value))
    return listItemsOf(value).map((i) => listItemText(i, t)).join(", ");
  return formatSlotValue(value);
}

export {
  barView,
  slotKind,
  slotIsWhole,
  numberDraftFor,
  listItemsOf,
  listItemText,
  listItemKeyOf,
  listWithAdded,
  listWithout,
  listMoved,
  ITEM_ENTRY_TYPE_ID,
  slotTakesLoreRefs,
  listItemRef,
  pickableEntries,
  countDraftFor,
  listWithRefAdded,
  listWithRefStep,
  storyTimeDraftOf,
  storyTimeDraftValue,
  shownValueText
};
