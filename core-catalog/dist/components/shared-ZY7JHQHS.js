import {
  ITEM_ENTRY_TYPE_ID,
  barView,
  countDraftFor,
  listItemKeyOf,
  listItemRef,
  listItemText,
  listItemsOf,
  listMoved,
  listWithAdded,
  listWithRefAdded,
  listWithRefStep,
  listWithout,
  numberDraftFor,
  pickableEntries,
  shownValueText,
  slotIsWhole,
  slotKind,
  slotTakesLoreRefs,
  storyTimeDraftOf,
  storyTimeDraftValue
} from "./shared-QPC5C2J7.js";
import {
  append,
  autofocus,
  bind_value,
  child,
  comment,
  delegate,
  delegated,
  each,
  event,
  first_child,
  from_html,
  get,
  if_block,
  pop,
  prop,
  proxy,
  push,
  remove_input_defaults,
  reset,
  set,
  set_attribute,
  set_custom_element_data,
  set_style,
  set_text,
  sibling,
  state,
  template_effect,
  user_derived
} from "./shared-BECW7NYS.js";

// dist/ui/sessions/session-state/stateView.js
function pickedNames(raw) {
  return Array.isArray(raw) ? raw.map((n) => String(n).trim().toLowerCase()).filter(Boolean) : [];
}
function bagOf(state2, owner) {
  if (owner.kind === "session")
    return state2.resolved.world ?? {};
  if (owner.kind === "session_location")
    return state2.resolved.locations?.[owner.key] ?? {};
  return state2.resolved.cast?.[owner.key] ?? {};
}
function slotsFor(state2, owner) {
  return state2.slots.filter((s) => Object.hasOwn(owner.configs ?? {}, s.slotId));
}
function valueOf(state2, owner, slot) {
  return bagOf(state2, owner)[slot.qualifiedKey];
}
function hasAnyValue(state2, owner) {
  return slotsFor(state2, owner).some((s) => valueOf(state2, owner, s) !== void 0);
}
function slotPicked(slot, mode, picked) {
  return mode !== "pick" || picked.includes(slot.key) || picked.includes(slot.label.toLowerCase());
}
function shown(state2, owner, mode, picked) {
  return slotsFor(state2, owner).filter((slot) => slotPicked(slot, mode, picked)).map((slot) => ({ slot, config: owner.configs[slot.slotId] ?? {}, value: valueOf(state2, owner, slot) }));
}
var pickEnum = (raw, of, fallback) => typeof raw === "string" && of.includes(raw) ? raw : fallback;
function worldStateView(state2, settings, granted) {
  const layout = pickEnum(settings.layout, ["strip", "list"], "strip");
  if (granted === false)
    return { status: "not-granted", layout };
  if (state2 && !state2.loaded && state2.error)
    return { status: "failed", layout };
  if (!state2 || !state2.loaded)
    return { status: "loading", layout };
  const mode = pickEnum(settings.slots, ["all", "pick"], "all");
  const picked = pickedNames(settings.pickSlots);
  const world = state2.owners.find((o) => o.kind === "session" && o.key === "world") ?? null;
  const slots = world ? shown(state2, world, mode, picked) : [];
  const places = state2.owners.filter((o) => o.kind === "session_location").map((owner) => ({ owner, slots: shown(state2, owner, mode, picked).filter((s) => s.value !== void 0) })).filter((place) => place.slots.length);
  if (!world || !slots.length && !places.length)
    return { status: "empty", layout, reason: state2.slots.length ? "none-shown" : "none-declared" };
  return { status: "shown", layout, owner: world, slots, places };
}
function statsView(state2, settings, granted) {
  const density = pickEnum(settings.density, ["compact", "full"], "full");
  if (granted === false)
    return { status: "not-granted", density };
  if (state2 && !state2.loaded && state2.error)
    return { status: "failed", density };
  if (!state2 || !state2.loaded)
    return { status: "loading", density };
  if (!state2.slots.length)
    return { status: "none-declared", density };
  const membersMode = pickEnum(settings.members, ["scene", "all", "pick"], "scene");
  const slotsMode = pickEnum(settings.slots, ["all", "pick"], "all");
  const pickedMembers = pickedNames(settings.pickMembers);
  const pickedSlots = pickedNames(settings.pickSlots);
  const members = state2.owners.filter((o) => o.kind === "session_cast").filter((owner) => {
    if (membersMode === "all")
      return true;
    if (membersMode === "pick")
      return pickedMembers.includes(owner.label.toLowerCase()) || pickedMembers.includes(owner.key);
    return hasAnyValue(state2, owner);
  }).map((owner) => ({ owner, slots: shown(state2, owner, slotsMode, pickedSlots) }));
  if (!members.length)
    return { status: "no-members", density, members: membersMode };
  return { status: "shown", density, members };
}
var slotWritable = (slot) => slot.type !== "derived" && !slot.retired;
function textDraftValue(draft, config) {
  const text = draft == null ? "" : String(draft);
  if (text.trim() === "")
    return null;
  const max = config.maxLength;
  return typeof max === "number" && Number.isInteger(max) && max >= 0 ? text.slice(0, max) : text;
}
function enumValues(config) {
  return Array.isArray(config.of) ? config.of.map(String) : [];
}

// components/sessions/state/SlotControl.svelte
var root = from_html(`<span data-widget-part="stat-slot.required" role="img">*</span>`);
var root_1 = from_html(`<sp-icon></sp-icon>`, 2);
var root_2 = from_html(`<button type="button" data-widget-part="stat-slot.chip chip"> </button>`);
var root_3 = from_html(`<input data-widget-part="stat-slot.field" type="number" keys="Escape Enter"/>`);
var root_4 = from_html(`<button type="button" data-widget-part="stat-slot.item-less"><sp-icon></sp-icon></button> <button type="button" data-widget-part="stat-slot.item-more"><sp-icon></sp-icon></button>`, 3);
var root_5 = from_html(`<li data-widget-part="stat-slot.item row"><span data-widget-part="stat-slot.item-text label"> </span> <!> <button type="button" data-widget-part="stat-slot.item-up"><sp-icon></sp-icon></button> <button type="button" data-widget-part="stat-slot.item-down"><sp-icon></sp-icon></button> <button type="button" data-widget-part="stat-slot.item-remove"><sp-icon></sp-icon></button></li>`, 2);
var root_6 = from_html(`<ol data-widget-part="stat-slot.items list"></ol>`);
var root_7 = from_html(`<p data-widget-part="stat-slot.items-empty empty"> </p>`);
var root_8 = from_html(`<button type="button" data-widget-part="stat-slot.pick-open"><sp-icon></sp-icon> <span> </span></button>`, 2);
var root_9 = from_html(`<p data-widget-part="stat-slot.pick-status" role="status"> </p>`);
var root_10 = from_html(`<span data-widget-part="stat-slot.pick-held"> </span>`);
var root_11 = from_html(`<li><button type="button" data-widget-part="stat-slot.pick-entry row"><span data-widget-part="stat-slot.pick-title label"> </span> <!></button></li>`);
var root_12 = from_html(`<p data-widget-part="stat-slot.pick-heading"> </p> <ul data-widget-part="stat-slot.pick-list list"></ul>`, 1);
var root_13 = from_html(`<div data-widget-part="stat-slot.picker" role="group"><input data-widget-part="stat-slot.pick-search stat-slot.field" type="text" keys="Escape Enter"/> <!> <!> <div data-widget-part="stat-slot.pick-add toolbar"><input data-widget-part="stat-slot.pick-count stat-slot.field" type="number" min="1" step="1" keys="Escape Enter"/> <button type="button" data-widget-part="stat-slot.pick-confirm"> </button> <button type="button" data-widget-part="stat-slot.pick-close"> </button></div></div>`);
var root_14 = from_html(`<p data-widget-part="stat-slot.invalid" role="alert"> </p>`);
var root_15 = from_html(`<div data-widget-part="stat-slot.editor" role="group"><!> <input data-widget-part="stat-slot.add stat-slot.field" type="text" keys="Escape Enter"/> <!> <!> <button type="button" data-widget-part="stat-slot.done"> </button></div>`);
var root_16 = from_html(`<div data-widget-part="stat-slot.editor" role="group"><input data-widget-part="stat-slot.year stat-slot.field" type="number" step="1" keys="Escape Enter"/> <input data-widget-part="stat-slot.month stat-slot.field" type="number" min="1" step="1" keys="Escape Enter"/> <input data-widget-part="stat-slot.day stat-slot.field" type="number" min="1" step="1" keys="Escape Enter"/> <input data-widget-part="stat-slot.clock stat-slot.field" type="text" placeholder="hh:mm" keys="Escape Enter"/> <!> <button type="button" data-widget-part="stat-slot.save"> </button> <button type="button" data-widget-part="stat-slot.cancel"> </button></div>`);
var root_17 = from_html(`<input data-widget-part="stat-slot.field" type="text" keys="Escape Enter"/>`);
var root_18 = from_html(`<button type="button" data-widget-part="stat-slot.bar"><span data-widget-part="stat-slot.track meter"><span data-widget-part="stat-slot.fill"></span></span> <span data-widget-part="stat-slot.bar-value value"> </span></button>`);
var root_19 = from_html(`<sp-menu-item><!> <span> </span></sp-menu-item>`, 2);
var root_20 = from_html(`<sp-menu><button slot="trigger" type="button" data-widget-part="stat-slot.chip chip"> </button> <sp-menu-item> </sp-menu-item> <!></sp-menu>`, 2);
var root_21 = from_html(`<button type="button" data-widget-part="stat-slot.chip chip" disabled=""> </button>`);
var root_22 = from_html(`<button type="button" data-widget-part="stat-slot.line value"> </button>`);
var root_23 = from_html(`<div data-widget-part="stat-slot.root row"><span data-widget-part="stat-slot.label label"> <!> <!></span> <div data-widget-part="stat-slot.control"><!></div></div>`);
function SlotControl($$anchor, $$props) {
  push($$props, true);
  let density = prop($$props, "density", 3, "full");
  const CLEAR = "clear";
  let editing = state(false);
  let numberDraft = state(null);
  let textDraft = state("");
  let itemDraft = state("");
  let timeDraft = state(proxy({ year: "", month: "", day: "", time: "" }));
  let invalid = state(null);
  let numberOpened = null;
  let textOpened = "";
  let picking = state(false);
  let pickWords = state("");
  let pickCount = state(1);
  let pickFound = state(null);
  let pickChosen = state(null);
  let pickBusy = state(false);
  let searches = 0;
  let kind = user_derived(() => slotKind($$props.slot));
  let bar = user_derived(() => get(kind) === "number" ? barView($$props.value, $$props.config) : null);
  let options = user_derived(() => enumValues($$props.config));
  let items = user_derived(() => listItemsOf($$props.value));
  let canPick = user_derived(() => !!$$props.findEntries && slotTakesLoreRefs($$props.config));
  let offered = user_derived(() => get(pickFound) ? pickableEntries($$props.value, get(pickFound).pages) : []);
  let offeredItems = user_derived(() => get(offered).filter((e) => e.item));
  let offeredOthers = user_derived(() => get(offered).filter((e) => !e.item));
  let chosen = user_derived(() => get(offered).find((e) => e.entryId === get(pickChosen)) ?? null);
  let writable = user_derived(() => slotWritable($$props.slot));
  let shown2 = user_derived(() => shownValueText($$props.slot, $$props.value, $$props.t));
  let notSet = user_derived(() => $$props.t("not set"));
  let fieldLabel = user_derived(() => $$props.t("{label} value").replace("{label}", $$props.slot.label));
  let editLabel = user_derived(() => $$props.t("{label}, edit").replace("{label}", $$props.slot.label));
  let barEditLabel = user_derived(() => get(bar) ? $$props.t("{label} {value}, edit").replace("{label}", $$props.slot.label).replace("{value}", get(bar).label) : get(editLabel));
  function open() {
    if (!get(writable)) return;
    set(numberDraft, numberOpened = typeof $$props.value === "number" ? $$props.value : null, true);
    set(textDraft, textOpened = $$props.value === void 0 || $$props.value === null ? "" : String($$props.value), true);
    set(itemDraft, "");
    set(timeDraft, storyTimeDraftOf($$props.value), true);
    set(invalid, null);
    set(picking, false);
    set(editing, true);
  }
  function commitNumber() {
    if (!get(editing)) return;
    set(editing, false);
    const next = numberDraftFor(get(numberDraft), $$props.config, slotIsWhole($$props.slot));
    if (next !== void 0) $$props.onset(next);
  }
  function commitText() {
    if (!get(editing)) return;
    set(editing, false);
    $$props.onset(textDraftValue(get(textDraft), $$props.config));
  }
  function onkey(e, commit) {
    if (e.detail.key === "Enter") commit();
    else if (e.detail.key === "Escape") set(editing, false);
  }
  function onblur(unchanged, commit) {
    if (!get(editing)) return;
    if (unchanged) set(editing, false);
    else commit();
  }
  function pick(e) {
    const v = e.detail.value;
    if (v === CLEAR) $$props.onset(null);
    else if (v.startsWith("opt:")) $$props.onset(v.slice(4));
  }
  function addItem() {
    const edit = listWithAdded($$props.value, get(itemDraft), $$props.config);
    if (!edit) return;
    if (edit.refusal) {
      set(invalid, edit.refusal, true);
      return;
    }
    set(invalid, null);
    set(itemDraft, "");
    $$props.onset(edit.value);
  }
  function onItemKey(e) {
    if (e.detail.key === "Enter") addItem();
    else if (e.detail.key === "Escape") set(editing, false);
  }
  async function search() {
    if (!$$props.findEntries) return;
    const mine = ++searches;
    set(pickBusy, true);
    try {
      const found = await $$props.findEntries(get(pickWords));
      if (mine !== searches) return;
      set(pickFound, found, true);
      if (get(pickChosen) !== null && !found.pages.some((p) => p.some((r) => r.id === get(pickChosen)))) set(pickChosen, null);
    } catch (e) {
      if (mine !== searches) return;
      set(
        pickFound,
        {
          pages: [],
          notice: e instanceof Error ? e.message : String(e)
        },
        true
      );
    } finally {
      if (mine === searches) set(pickBusy, false);
    }
  }
  function openPicker() {
    set(picking, true);
    set(pickWords, "");
    set(pickCount, 1);
    set(pickChosen, null);
    set(pickFound, null);
    set(invalid, null);
    void search();
  }
  function closePicker() {
    set(picking, false);
    set(pickChosen, null);
  }
  function addPicked() {
    if (!get(chosen)) {
      set(invalid, $$props.t("Choose an entry to add first."), true);
      return;
    }
    const count = countDraftFor(get(pickCount));
    if (count === void 0) {
      set(invalid, $$props.t("How many is a whole number, 1 or more."), true);
      return;
    }
    const edit = listWithRefAdded($$props.value, get(chosen).entryId, count, $$props.config);
    if (edit.refusal) {
      set(invalid, edit.refusal, true);
      return;
    }
    set(invalid, null);
    set(pickCount, 1);
    $$props.onset(edit.value);
  }
  function onPickKey(e, enter) {
    if (e.detail.key === "Enter") enter();
    else if (e.detail.key === "Escape") closePicker();
  }
  function commitTime() {
    if (!get(editing)) return;
    const next = storyTimeDraftValue(get(timeDraft));
    if (next === void 0) {
      set(invalid, $$props.t("That is not a story time: a year, then a month, a day and a time as hh:mm \u2014 each optional, a day only with a month."), true);
      return;
    }
    set(editing, false);
    set(invalid, null);
    $$props.onset(next);
  }
  function onTimeKey(e) {
    if (e.detail.key === "Enter") commitTime();
    else if (e.detail.key === "Escape") set(editing, false);
  }
  var div = root_23();
  var span = child(div);
  var text = child(span);
  var node = sibling(text);
  {
    var consequent = ($$anchor2) => {
      var span_1 = root();
      template_effect(
        ($0, $1) => {
          set_attribute(span_1, "aria-label", $0);
          set_attribute(span_1, "title", $1);
        },
        [() => $$props.t("required"), () => $$props.t("required")]
      );
      append($$anchor2, span_1);
    };
    if_block(node, ($$render) => {
      if ($$props.slot.required) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var sp_icon = root_1();
      set_custom_element_data(sp_icon, "name", "archive");
      set_custom_element_data(sp_icon, "size", "10");
      template_effect(($0) => set_custom_element_data(sp_icon, "label", $0), [() => $$props.t("retired")]);
      append($$anchor2, sp_icon);
    };
    var consequent_2 = ($$anchor2) => {
      var sp_icon_1 = root_1();
      set_custom_element_data(sp_icon_1, "name", "sigma");
      set_custom_element_data(sp_icon_1, "size", "10");
      append($$anchor2, sp_icon_1);
    };
    if_block(node_1, ($$render) => {
      if ($$props.slot.retired) $$render(consequent_1);
      else if (get(kind) === "derived") $$render(consequent_2, 1);
    });
  }
  reset(span);
  var div_1 = sibling(span, 2);
  var node_2 = child(div_1);
  {
    var consequent_3 = ($$anchor2) => {
      var button = root_2();
      var text_1 = child(button, true);
      reset(button);
      template_effect(() => {
        set_attribute(button, "aria-pressed", $$props.value === true);
        set_text(text_1, $$props.value === void 0 ? get(notSet) : get(shown2));
      });
      delegated("click", button, () => $$props.onset($$props.value === true ? false : true));
      append($$anchor2, button);
    };
    var consequent_4 = ($$anchor2) => {
      var input = root_3();
      remove_input_defaults(input);
      autofocus(input, true);
      template_effect(
        ($0) => {
          set_attribute(input, "aria-label", get(fieldLabel));
          set_attribute(input, "min", $$props.config.min);
          set_attribute(input, "max", $$props.config.max);
          set_attribute(input, "step", $0);
        },
        [() => slotIsWhole($$props.slot) ? "1" : "any"]
      );
      event("blur", input, () => onblur(get(numberDraft) === numberOpened, commitNumber));
      event("key", input, (e) => onkey(e, commitNumber));
      bind_value(input, () => get(numberDraft), ($$value) => set(numberDraft, $$value));
      append($$anchor2, input);
    };
    var consequent_16 = ($$anchor2) => {
      var div_2 = root_15();
      var node_3 = child(div_2);
      {
        var consequent_6 = ($$anchor3) => {
          var ol = root_6();
          each(ol, 23, () => get(items), (item, i) => listItemKeyOf(item, i), ($$anchor4, item, i) => {
            const itemText = user_derived(() => listItemText(get(item), $$props.t));
            const ref = user_derived(() => listItemRef(get(item)));
            var li = root_5();
            var span_2 = child(li);
            var text_2 = child(span_2, true);
            reset(span_2);
            var node_4 = sibling(span_2, 2);
            {
              var consequent_5 = ($$anchor5) => {
                var fragment = root_4();
                var button_1 = first_child(fragment);
                var sp_icon_2 = child(button_1);
                set_custom_element_data(sp_icon_2, "name", "minus");
                set_custom_element_data(sp_icon_2, "size", "11");
                reset(button_1);
                var button_2 = sibling(button_1, 2);
                var sp_icon_3 = child(button_2);
                set_custom_element_data(sp_icon_3, "name", "plus");
                set_custom_element_data(sp_icon_3, "size", "11");
                reset(button_2);
                template_effect(
                  ($0, $1) => {
                    set_attribute(button_1, "aria-label", $0);
                    set_attribute(button_2, "aria-label", $1);
                  },
                  [
                    () => $$props.t("One fewer {item}").replace("{item}", get(itemText)),
                    () => $$props.t("One more {item}").replace("{item}", get(itemText))
                  ]
                );
                delegated("click", button_1, () => $$props.onset(listWithRefStep($$props.value, get(ref).entryId, -1)));
                delegated("click", button_2, () => $$props.onset(listWithRefStep($$props.value, get(ref).entryId, 1)));
                append($$anchor5, fragment);
              };
              if_block(node_4, ($$render) => {
                if (get(ref)) $$render(consequent_5);
              });
            }
            var button_3 = sibling(node_4, 2);
            var sp_icon_4 = child(button_3);
            set_custom_element_data(sp_icon_4, "name", "arrow-up");
            set_custom_element_data(sp_icon_4, "size", "11");
            reset(button_3);
            var button_4 = sibling(button_3, 2);
            var sp_icon_5 = child(button_4);
            set_custom_element_data(sp_icon_5, "name", "arrow-down");
            set_custom_element_data(sp_icon_5, "size", "11");
            reset(button_4);
            var button_5 = sibling(button_4, 2);
            var sp_icon_6 = child(button_5);
            set_custom_element_data(sp_icon_6, "name", "x");
            set_custom_element_data(sp_icon_6, "size", "11");
            reset(button_5);
            reset(li);
            template_effect(
              ($0, $1, $2) => {
                set_attribute(li, "data-item-index", get(i));
                set_text(text_2, get(itemText));
                button_3.disabled = get(i) === 0;
                set_attribute(button_3, "aria-label", $0);
                button_4.disabled = get(i) === get(items).length - 1;
                set_attribute(button_4, "aria-label", $1);
                set_attribute(button_5, "aria-label", $2);
              },
              [
                () => $$props.t("Move {item} up").replace("{item}", get(itemText)),
                () => $$props.t("Move {item} down").replace("{item}", get(itemText)),
                () => $$props.t("Remove {item}").replace("{item}", get(itemText))
              ]
            );
            delegated("click", button_3, () => $$props.onset(listMoved($$props.value, get(i), -1)));
            delegated("click", button_4, () => $$props.onset(listMoved($$props.value, get(i), 1)));
            delegated("click", button_5, () => $$props.onset(listWithout($$props.value, get(i))));
            append($$anchor4, li);
          });
          reset(ol);
          append($$anchor3, ol);
        };
        var alternate = ($$anchor3) => {
          var p_1 = root_7();
          var text_3 = child(p_1, true);
          reset(p_1);
          template_effect(($0) => set_text(text_3, $0), [() => $$props.t("Nothing in the list yet.")]);
          append($$anchor3, p_1);
        };
        if_block(node_3, ($$render) => {
          if (get(items).length) $$render(consequent_6);
          else $$render(alternate, -1);
        });
      }
      var input_1 = sibling(node_3, 2);
      remove_input_defaults(input_1);
      autofocus(input_1, true);
      var node_5 = sibling(input_1, 2);
      {
        var consequent_7 = ($$anchor3) => {
          var button_6 = root_8();
          var sp_icon_7 = child(button_6);
          set_custom_element_data(sp_icon_7, "name", "book-open");
          set_custom_element_data(sp_icon_7, "size", "12");
          var span_3 = sibling(sp_icon_7, 2);
          var text_4 = child(span_3, true);
          reset(span_3);
          reset(button_6);
          template_effect(($0) => set_text(text_4, $0), [() => $$props.t("Add from the lorebook")]);
          delegated("click", button_6, openPicker);
          append($$anchor3, button_6);
        };
        var consequent_14 = ($$anchor3) => {
          var div_3 = root_13();
          var input_2 = child(div_3);
          remove_input_defaults(input_2);
          autofocus(input_2, true);
          var node_6 = sibling(input_2, 2);
          {
            var consequent_8 = ($$anchor4) => {
              var p_2 = root_9();
              var text_5 = child(p_2, true);
              reset(p_2);
              template_effect(($0) => set_text(text_5, $0), [() => $$props.t("Searching the lorebook\u2026")]);
              append($$anchor4, p_2);
            };
            var consequent_9 = ($$anchor4) => {
              var p_3 = root_9();
              var text_6 = child(p_3, true);
              reset(p_3);
              template_effect(() => set_text(text_6, get(pickFound).notice));
              append($$anchor4, p_3);
            };
            var consequent_10 = ($$anchor4) => {
              var p_4 = root_9();
              var text_7 = child(p_4, true);
              reset(p_4);
              template_effect(($0) => set_text(text_7, $0), [() => $$props.t("Nothing in the lorebook matches.")]);
              append($$anchor4, p_4);
            };
            var alternate_1 = ($$anchor4) => {
              var fragment_1 = comment();
              var node_7 = first_child(fragment_1);
              each(
                node_7,
                17,
                () => [
                  {
                    heading: $$props.t("Items"),
                    rows: get(offeredItems),
                    group: "items"
                  },
                  {
                    heading: $$props.t("Other entries"),
                    rows: get(offeredOthers),
                    group: "others"
                  }
                ],
                (part) => part.group,
                ($$anchor5, part) => {
                  var fragment_2 = comment();
                  var node_8 = first_child(fragment_2);
                  {
                    var consequent_12 = ($$anchor6) => {
                      var fragment_3 = root_12();
                      var p_5 = first_child(fragment_3);
                      var text_8 = child(p_5, true);
                      reset(p_5);
                      var ul = sibling(p_5, 2);
                      each(ul, 21, () => get(part).rows, (entry) => entry.entryId, ($$anchor7, entry) => {
                        var li_1 = root_11();
                        var button_7 = child(li_1);
                        var span_4 = child(button_7);
                        var text_9 = child(span_4, true);
                        reset(span_4);
                        var node_9 = sibling(span_4, 2);
                        {
                          var consequent_11 = ($$anchor8) => {
                            var span_5 = root_10();
                            var text_10 = child(span_5, true);
                            reset(span_5);
                            template_effect(($0) => set_text(text_10, $0), [
                              () => $$props.t("held \xD7{n}").replace("{n}", String(get(entry).held))
                            ]);
                            append($$anchor8, span_5);
                          };
                          if_block(node_9, ($$render) => {
                            if (get(entry).held) $$render(consequent_11);
                          });
                        }
                        reset(button_7);
                        reset(li_1);
                        template_effect(() => {
                          set_attribute(button_7, "data-entry-id", get(entry).entryId);
                          set_attribute(button_7, "aria-pressed", get(pickChosen) === get(entry).entryId);
                          set_text(text_9, get(entry).title);
                        });
                        delegated("click", button_7, () => set(pickChosen, get(pickChosen) === get(entry).entryId ? null : get(entry).entryId, true));
                        append($$anchor7, li_1);
                      });
                      reset(ul);
                      template_effect(() => {
                        set_text(text_8, get(part).heading);
                        set_attribute(ul, "aria-label", get(part).heading);
                        set_attribute(ul, "data-pick-group", get(part).group);
                      });
                      append($$anchor6, fragment_3);
                    };
                    if_block(node_8, ($$render) => {
                      if (get(part).rows.length) $$render(consequent_12);
                    });
                  }
                  append($$anchor5, fragment_2);
                }
              );
              append($$anchor4, fragment_1);
            };
            if_block(node_6, ($$render) => {
              if (!get(pickFound)) $$render(consequent_8);
              else if (get(pickFound).notice) $$render(consequent_9, 1);
              else if (!get(offered).length) $$render(consequent_10, 2);
              else $$render(alternate_1, -1);
            });
          }
          var node_10 = sibling(node_6, 2);
          {
            var consequent_13 = ($$anchor4) => {
              var p_6 = root_9();
              var text_11 = child(p_6, true);
              reset(p_6);
              template_effect(($0) => set_text(text_11, $0), [() => $$props.t("Searching the lorebook\u2026")]);
              append($$anchor4, p_6);
            };
            if_block(node_10, ($$render) => {
              if (get(pickBusy) && get(pickFound)) $$render(consequent_13);
            });
          }
          var div_4 = sibling(node_10, 2);
          var input_3 = child(div_4);
          remove_input_defaults(input_3);
          var button_8 = sibling(input_3, 2);
          var text_12 = child(button_8, true);
          reset(button_8);
          var button_9 = sibling(button_8, 2);
          var text_13 = child(button_9, true);
          reset(button_9);
          reset(div_4);
          reset(div_3);
          template_effect(
            ($0, $1, $2, $3, $4, $5) => {
              set_attribute(div_3, "aria-label", $0);
              set_attribute(input_2, "aria-label", $1);
              set_attribute(input_2, "placeholder", $2);
              set_attribute(input_3, "aria-label", $3);
              button_8.disabled = !get(chosen);
              set_text(text_12, $4);
              set_text(text_13, $5);
            },
            [
              () => $$props.t("Add to {label} from the lorebook").replace("{label}", $$props.slot.label),
              () => $$props.t("Search the lorebook"),
              () => $$props.t("Search by name or key, then Enter"),
              () => get(chosen) ? $$props.t("How many {item} to add").replace("{item}", get(chosen).title) : $$props.t("How many to add"),
              () => get(chosen) ? $$props.t("Add {item}").replace("{item}", get(chosen).title) : $$props.t("Add"),
              () => $$props.t("Close")
            ]
          );
          event("key", input_2, (e) => onPickKey(e, () => void search()));
          bind_value(input_2, () => get(pickWords), ($$value) => set(pickWords, $$value));
          event("key", input_3, (e) => onPickKey(e, addPicked));
          bind_value(input_3, () => get(pickCount), ($$value) => set(pickCount, $$value));
          delegated("click", button_8, addPicked);
          delegated("click", button_9, closePicker);
          append($$anchor3, div_3);
        };
        if_block(node_5, ($$render) => {
          if (get(canPick) && !get(picking)) $$render(consequent_7);
          else if (get(canPick)) $$render(consequent_14, 1);
        });
      }
      var node_11 = sibling(node_5, 2);
      {
        var consequent_15 = ($$anchor3) => {
          var p_7 = root_14();
          var text_14 = child(p_7, true);
          reset(p_7);
          template_effect(() => set_text(text_14, get(invalid)));
          append($$anchor3, p_7);
        };
        if_block(node_11, ($$render) => {
          if (get(invalid)) $$render(consequent_15);
        });
      }
      var button_10 = sibling(node_11, 2);
      var text_15 = child(button_10, true);
      reset(button_10);
      reset(div_2);
      template_effect(
        ($0, $1, $2) => {
          set_attribute(div_2, "aria-label", get(fieldLabel));
          set_attribute(input_1, "aria-label", $0);
          set_attribute(input_1, "placeholder", $1);
          set_text(text_15, $2);
        },
        [
          () => $$props.t("Add to {label}").replace("{label}", $$props.slot.label),
          () => $$props.t("Add an item, then Enter"),
          () => $$props.t("Done")
        ]
      );
      event("key", input_1, onItemKey);
      bind_value(input_1, () => get(itemDraft), ($$value) => set(itemDraft, $$value));
      delegated("click", button_10, () => set(editing, false));
      append($$anchor2, div_2);
    };
    var consequent_18 = ($$anchor2) => {
      var div_5 = root_16();
      var input_4 = child(div_5);
      remove_input_defaults(input_4);
      autofocus(input_4, true);
      var input_5 = sibling(input_4, 2);
      remove_input_defaults(input_5);
      var input_6 = sibling(input_5, 2);
      remove_input_defaults(input_6);
      var input_7 = sibling(input_6, 2);
      remove_input_defaults(input_7);
      var node_12 = sibling(input_7, 2);
      {
        var consequent_17 = ($$anchor3) => {
          var p_8 = root_14();
          var text_16 = child(p_8, true);
          reset(p_8);
          template_effect(() => set_text(text_16, get(invalid)));
          append($$anchor3, p_8);
        };
        if_block(node_12, ($$render) => {
          if (get(invalid)) $$render(consequent_17);
        });
      }
      var button_11 = sibling(node_12, 2);
      var text_17 = child(button_11, true);
      reset(button_11);
      var button_12 = sibling(button_11, 2);
      var text_18 = child(button_12, true);
      reset(button_12);
      reset(div_5);
      template_effect(
        ($0, $1, $2, $3, $4, $5, $6, $7, $8) => {
          set_attribute(div_5, "aria-label", get(fieldLabel));
          set_attribute(input_4, "aria-label", $0);
          set_attribute(input_4, "placeholder", $1);
          set_attribute(input_5, "aria-label", $2);
          set_attribute(input_5, "placeholder", $3);
          set_attribute(input_6, "aria-label", $4);
          set_attribute(input_6, "placeholder", $5);
          set_attribute(input_7, "aria-label", $6);
          set_text(text_17, $7);
          set_text(text_18, $8);
        },
        [
          () => $$props.t("Year"),
          () => $$props.t("Year"),
          () => $$props.t("Month"),
          () => $$props.t("Month"),
          () => $$props.t("Day"),
          () => $$props.t("Day"),
          () => $$props.t("Time of day"),
          () => $$props.t("Save"),
          () => $$props.t("Cancel")
        ]
      );
      event("key", input_4, onTimeKey);
      bind_value(input_4, () => get(timeDraft).year, ($$value) => get(timeDraft).year = $$value);
      event("key", input_5, onTimeKey);
      bind_value(input_5, () => get(timeDraft).month, ($$value) => get(timeDraft).month = $$value);
      event("key", input_6, onTimeKey);
      bind_value(input_6, () => get(timeDraft).day, ($$value) => get(timeDraft).day = $$value);
      event("key", input_7, onTimeKey);
      bind_value(input_7, () => get(timeDraft).time, ($$value) => get(timeDraft).time = $$value);
      delegated("click", button_11, commitTime);
      delegated("click", button_12, () => set(editing, false));
      append($$anchor2, div_5);
    };
    var consequent_19 = ($$anchor2) => {
      var input_8 = root_17();
      remove_input_defaults(input_8);
      autofocus(input_8, true);
      template_effect(() => set_attribute(input_8, "aria-label", get(fieldLabel)));
      delegated("change", input_8, commitText);
      event("blur", input_8, () => onblur(get(textDraft) === textOpened, commitText));
      event("key", input_8, (e) => onkey(e, commitText));
      bind_value(input_8, () => get(textDraft), ($$value) => set(textDraft, $$value));
      append($$anchor2, input_8);
    };
    var consequent_20 = ($$anchor2) => {
      var button_13 = root_18();
      var span_6 = child(button_13);
      var span_7 = child(span_6);
      let styles;
      reset(span_6);
      var span_8 = sibling(span_6, 2);
      var text_19 = child(span_8, true);
      reset(span_8);
      reset(button_13);
      template_effect(() => {
        button_13.disabled = !get(writable);
        set_attribute(button_13, "aria-label", get(barEditLabel));
        styles = set_style(span_7, "", styles, { "--sp-fill": `${get(bar).percent ?? ""}%` });
        set_text(text_19, get(bar).label);
      });
      delegated("click", button_13, open);
      append($$anchor2, button_13);
    };
    var consequent_22 = ($$anchor2) => {
      var sp_menu = root_20();
      template_effect(() => set_custom_element_data(sp_menu, "label", get(fieldLabel)));
      var button_14 = child(sp_menu);
      var text_20 = child(button_14, true);
      reset(button_14);
      var sp_menu_item = sibling(button_14, 2);
      set_custom_element_data(sp_menu_item, "value", CLEAR);
      set_custom_element_data(sp_menu_item, "data-widget-part", "stat-slot.option");
      set_custom_element_data(sp_menu_item, "data-empty", "");
      var text_21 = child(sp_menu_item, true);
      reset(sp_menu_item);
      var node_13 = sibling(sp_menu_item, 2);
      each(node_13, 16, () => get(options), (option) => option, ($$anchor3, option) => {
        var sp_menu_item_1 = root_19();
        template_effect(() => set_custom_element_data(sp_menu_item_1, "value", `opt:${option ?? ""}`));
        set_custom_element_data(sp_menu_item_1, "data-widget-part", "stat-slot.option");
        var node_14 = child(sp_menu_item_1);
        {
          var consequent_21 = ($$anchor4) => {
            var sp_icon_8 = root_1();
            set_custom_element_data(sp_icon_8, "name", "check");
            set_custom_element_data(sp_icon_8, "size", "12");
            template_effect(($0) => set_custom_element_data(sp_icon_8, "label", $0), [() => $$props.t("current")]);
            append($$anchor4, sp_icon_8);
          };
          if_block(node_14, ($$render) => {
            if ($$props.value === option) $$render(consequent_21);
          });
        }
        var span_9 = sibling(node_14, 2);
        var text_22 = child(span_9, true);
        reset(span_9);
        reset(sp_menu_item_1);
        template_effect(() => set_text(text_22, option));
        append($$anchor3, sp_menu_item_1);
      });
      reset(sp_menu);
      template_effect(() => {
        set_attribute(button_14, "data-empty", $$props.value == null ? "" : void 0);
        set_attribute(button_14, "aria-label", get(editLabel));
        set_text(text_20, get(shown2) || get(notSet));
        set_text(text_21, get(notSet));
      });
      event("select", sp_menu, pick);
      append($$anchor2, sp_menu);
    };
    var consequent_23 = ($$anchor2) => {
      var button_15 = root_21();
      var text_23 = child(button_15, true);
      reset(button_15);
      template_effect(() => {
        set_attribute(button_15, "data-empty", $$props.value == null ? "" : void 0);
        set_attribute(button_15, "aria-label", get(editLabel));
        set_text(text_23, get(shown2) || get(notSet));
      });
      append($$anchor2, button_15);
    };
    var consequent_24 = ($$anchor2) => {
      var button_16 = root_22();
      var text_24 = child(button_16, true);
      reset(button_16);
      template_effect(
        ($0) => {
          set_attribute(button_16, "data-empty", get(items).length ? void 0 : "");
          button_16.disabled = !get(writable);
          set_attribute(button_16, "aria-label", get(editLabel));
          set_text(text_24, $0);
        },
        [
          () => get(items).length ? get(shown2) : $$props.value === void 0 ? get(notSet) : $$props.t("none")
        ]
      );
      delegated("click", button_16, open);
      append($$anchor2, button_16);
    };
    var alternate_2 = ($$anchor2) => {
      var button_17 = root_22();
      var text_25 = child(button_17, true);
      reset(button_17);
      template_effect(() => {
        set_attribute(button_17, "data-empty", $$props.value === void 0 ? "" : void 0);
        button_17.disabled = !get(writable);
        set_attribute(button_17, "aria-label", get(editLabel));
        set_text(text_25, get(shown2) || get(notSet));
      });
      delegated("click", button_17, open);
      append($$anchor2, button_17);
    };
    if_block(node_2, ($$render) => {
      if (get(kind) === "boolean" && get(writable)) $$render(consequent_3);
      else if (get(editing) && get(kind) === "number") $$render(consequent_4, 1);
      else if (get(editing) && get(kind) === "list") $$render(consequent_16, 2);
      else if (get(editing) && get(kind) === "story-time") $$render(consequent_18, 3);
      else if (get(editing)) $$render(consequent_19, 4);
      else if (get(bar)) $$render(consequent_20, 5);
      else if (get(kind) === "choice" && get(writable)) $$render(consequent_22, 6);
      else if (get(kind) === "choice") $$render(consequent_23, 7);
      else if (get(kind) === "list") $$render(consequent_24, 8);
      else $$render(alternate_2, -1);
    });
  }
  reset(div_1);
  reset(div);
  template_effect(() => {
    set_attribute(div, "data-density", density());
    set_attribute(div, "data-slot-id", $$props.slot.slotId);
    set_attribute(div, "data-slot-type", $$props.slot.type);
    set_attribute(div, "data-slot-shape", get(kind));
    set_attribute(div, "data-retired", $$props.slot.retired ? "" : void 0);
    set_attribute(span, "title", $$props.slot.description ?? $$props.slot.label);
    set_text(text, `${$$props.slot.label ?? ""} `);
  });
  append($$anchor, div);
  pop();
}
delegate(["click", "change"]);

// components/sessions/state/slotWriter.svelte.ts
function createSlotWriter(widget) {
  let error = state(null);
  let asked = 0;
  return {
    get error() {
      return get(error);
    },
    async set(owner, slotId, value) {
      const mine = ++asked;
      set(error, null);
      if (!widget) return;
      try {
        await widget.current.request("set-attribute-value", { owner: { kind: owner.kind, id: owner.id }, slotId, value });
      } catch (e) {
        if (mine === asked) set(error, e instanceof Error ? e.message : String(e), true);
      }
    }
  };
}

// components/sessions/state/entryFinder.ts
var PAGE = 25;
function createEntryFinder(widget, t) {
  if (!widget) return void 0;
  return async (titleOrKey) => {
    const words = titleOrKey.trim();
    const ask = (typeIds) => widget.current.request("session-entries", {
      ...words ? { titleOrKey: words } : {},
      sort: "name",
      ...typeIds ? { typeIds } : {},
      limit: PAGE
    });
    const items = await ask([ITEM_ENTRY_TYPE_ID]);
    if (items.lorebookId == null) return { pages: [], notice: t("This session reads no lorebook, so there is nothing to pick from.") };
    if (items.ownerOnly)
      return { pages: [], notice: t("Only the lorebook's owner can pick from it. Type the item's name instead.") };
    const rest = await ask();
    const rows = (page) => page.rows.map(({ id, typeId, title }) => ({ id, typeId, title }));
    return { pages: [rows(items), rows(rest)], notice: null };
  };
}

export {
  worldStateView,
  statsView,
  SlotControl,
  createSlotWriter,
  createEntryFinder
};
