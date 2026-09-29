import {
  WIDGET_CONTEXT_KEY,
  append,
  child,
  comment,
  delegate,
  delegated,
  each,
  first_child,
  from_html,
  get,
  if_block,
  pop,
  prop,
  push,
  remove_input_defaults,
  reset,
  set,
  setContext,
  set_attribute,
  set_checked,
  set_custom_element_data,
  set_text,
  set_value,
  sibling,
  state,
  svelteComponent,
  template_effect,
  untrack,
  useWidgetContext,
  user_derived,
  user_effect,
  widgetRefFromComponent
} from "./shared-BECW7NYS.js";

// dist/ui/sessions/lore-entries/index.js
var LORE_ENTRIES_FILTERS = Object.freeze([
  { value: "all", label: "All" },
  { value: "fired", label: "Read" },
  { value: "pinned", label: "Pinned" },
  { value: "off", label: "Off" }
]);
var LORE_ENTRIES_SORTS = Object.freeze([
  { value: "lastRead", label: "Last read" },
  { value: "timesRead", label: "Times read" },
  { value: "rank", label: "Rank" },
  { value: "name", label: "Name" }
]);
var LORE_ENTRIES_DEFAULTS = Object.freeze({ sort: "lastRead", pageSize: 25 });
function readLoreEntriesSettings(raw) {
  const v = raw ?? {};
  const sort = LORE_ENTRIES_SORTS.some((s) => s.value === v.sort) ? v.sort : LORE_ENTRIES_DEFAULTS.sort;
  const pageSize = typeof v.pageSize === "number" && Number.isInteger(v.pageSize) && v.pageSize >= 1 ? v.pageSize : LORE_ENTRIES_DEFAULTS.pageSize;
  return { sort, pageSize };
}
function loreEntryAgo(iso, now, t) {
  if (!iso)
    return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at))
    return null;
  const s = Math.round((now - at) / 1e3);
  if (s < 60)
    return t("just now");
  if (s < 3600)
    return t("{n}m ago").replace("{n}", String(Math.round(s / 60)));
  if (s < 86400)
    return t("{n}h ago").replace("{n}", String(Math.round(s / 3600)));
  return t("{n}d ago").replace("{n}", String(Math.round(s / 86400)));
}
function loreEntryReadLine(row, now, t) {
  if (!row.timesJudged)
    return t("Not read in this session yet");
  const parts = [
    t("read {included} of {judged}").replace("{included}", String(row.timesIncluded)).replace("{judged}", String(row.timesJudged))
  ];
  if (row.lastIncluded && row.lastRank != null)
    parts.push(t("last at rank {rank}").replace("{rank}", String(row.lastRank)));
  else if (row.lastIncluded === false)
    parts.push(t("left out last time"));
  const when = loreEntryAgo(row.lastJudgedAt, now, t);
  if (when)
    parts.push(when);
  return parts.join(t(" \xB7 "));
}
var loreEntryName = (row, t) => row.title || t("Entry #{id}").replace("{id}", String(row.id));
var loreEntriesEmptyLine = (titleOrKey, filter, t) => titleOrKey.trim() || filter !== "all" ? t("Nothing matches.") : t("This lorebook has no entries yet.");
function loreEntriesSpan(offset, pageSize, total) {
  return {
    from: offset + 1,
    to: Math.min(offset + pageSize, total),
    total,
    paged: total > pageSize,
    hasPrevious: offset > 0,
    hasNext: offset + pageSize < total,
    previousOffset: Math.max(0, offset - pageSize),
    nextOffset: offset + pageSize
  };
}
function createLatestAsk() {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: (ticket) => ticket === latest
  };
}

// components/sessions/lore-entries/LoreEntriesWidget.svelte
var root = from_html(`<p data-widget-part="lore-entries.note"> </p>`);
var root_1 = from_html(`<label data-widget-part="lore-entries.filter chip"><input type="radio" data-widget-part="lore-entries.filter-input"/> </label>`);
var root_2 = from_html(`<sp-option> </sp-option>`, 2);
var root_3 = from_html(`<p data-widget-part="lore-entries.alert" role="alert"> </p>`);
var root_4 = from_html(`<span data-widget-part="lore-entries.entry-keys"> </span>`);
var root_5 = from_html(`<li data-widget-part="lore-entries.entry row"><span data-widget-part="lore-entries.entry-text"><span data-widget-part="lore-entries.entry-title label"> </span> <!> <span data-widget-part="lore-entries.entry-read"> </span></span> <span data-widget-part="lore-entries.marks"><button type="button" data-widget-part="lore-entries.pin"><sp-icon></sp-icon></button> <button type="button" data-widget-part="lore-entries.off"><sp-icon></sp-icon></button></span></li>`, 2);
var root_6 = from_html(`<li data-widget-part="lore-entries.empty empty"> </li>`);
var root_7 = from_html(`<div data-widget-part="lore-entries.pager"><button type="button" data-widget-part="lore-entries.previous"> </button> <span data-widget-part="lore-entries.page-count"> </span> <button type="button" data-widget-part="lore-entries.next"> </button></div>`);
var root_8 = from_html(`<div data-widget-part="lore-entries.search-bar toolbar"><label data-widget-part="lore-entries.search"><span data-widget-part="lore-entries.search-label"> </span> <span data-widget-part="lore-entries.search-icon"><sp-icon></sp-icon></span> <input type="text" data-widget-part="lore-entries.search-input"/></label> <button type="button" data-widget-part="lore-entries.refresh"><sp-icon></sp-icon></button></div> <div data-widget-part="lore-entries.filter-bar toolbar"><div data-widget-part="lore-entries.filters" role="radiogroup"></div> <span data-widget-part="lore-entries.sort"><sp-combobox></sp-combobox></span></div> <!> <!> <ul data-widget-part="lore-entries.entries list"></ul> <!>`, 3);
var root_9 = from_html(`<div data-widget-part="lore-entries.root" data-widget="lore-entries"><!></div>`);
function LoreEntriesWidget($$anchor, $$props) {
  push($$props, true);
  let ready = prop($$props, "ready", 3, true);
  const widget = useWidgetContext();
  const t = (source) => widget?.current?.t(source) ?? source;
  const pageSize = user_derived(() => readLoreEntriesSettings(widget?.current?.settings?.v1).pageSize);
  const settledSort = user_derived(() => readLoreEntriesSettings(widget?.current?.settings?.v1).sort);
  let query = state("");
  let sort = state(null);
  const effectiveSort = user_derived(() => get(sort) ?? get(settledSort));
  let filter = state("all");
  let offset = state(0);
  let answer = state(null);
  let readError = state(null);
  let markError = state(null);
  const filterGroup = `sp-lore-filter-${Math.random().toString(36).slice(2, 10)}`;
  const latest = createLatestAsk();
  const reason = (e) => e instanceof Error ? e.message : String(e);
  let searched = state("");
  user_effect(() => {
    const q = get(query).trim();
    const timer = setTimeout(() => set(searched, q, true), 250);
    return () => clearTimeout(timer);
  });
  const askParams = () => ({
    ...get(searched) ? { titleOrKey: get(searched) } : {},
    sort: get(effectiveSort),
    filter: get(filter),
    offset: get(offset),
    limit: get(pageSize)
  });
  function ask(params) {
    const ctx = widget?.current;
    if (!ctx) return;
    const ticket = latest.next();
    ctx.request("session-entries", params).then(
      (res) => {
        if (!latest.isLatest(ticket)) return;
        set(readError, null);
        set(answer, res, true);
        if (typeof res.offset === "number" && res.offset !== get(offset)) set(offset, res.offset, true);
      },
      (e) => {
        if (!latest.isLatest(ticket)) return;
        set(readError, reason(e), true);
      }
    );
  }
  const refresh = () => untrack(() => ready() && ask(askParams()));
  user_effect(() => {
    if (!ready()) return;
    const params = askParams();
    untrack(() => {
      set(markError, null);
      ask(params);
    });
  });
  user_effect(() => untrack(() => widget?.current?.on("lore:ranked", refresh)));
  user_effect(() => untrack(() => widget?.current?.on("lore:marked", (e) => {
    if (e.kind === "lore:marked" && get(answer)?.rows.some((r) => r.id === e.entryId)) refresh();
  })));
  function setFilter(value) {
    set(filter, value, true);
    set(offset, 0);
  }
  async function setMark(row, mark) {
    const ctx = untrack(() => widget?.current);
    if (!ctx) return;
    set(markError, null);
    try {
      const now = await ctx.request("set-entry-marks", {
        entryId: row.id,
        ...mark === "off" ? { off: !row.off } : { pinned: !row.pinned }
      });
      if (get(answer)) set(
        answer,
        {
          ...get(answer),
          rows: get(answer).rows.map((r) => r.id === row.id ? { ...r, off: now.off, pinned: now.pinned } : r)
        },
        true
      );
    } catch (e) {
      set(markError, t("Not changed: {reason}").replace("{reason}", reason(e)), true);
    }
    refresh();
  }
  const span = user_derived(() => get(answer) ? loreEntriesSpan(get(offset), get(pageSize), get(answer).total) : null);
  const readLine = (r) => loreEntryReadLine(r, Date.now(), t);
  var div = root_9();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var p = root();
      var text = child(p, true);
      reset(p);
      template_effect(($0) => set_text(text, $0), [() => t("These entries are the lorebook owner's to manage.")]);
      append($$anchor2, p);
    };
    var consequent_1 = ($$anchor2) => {
      var p_1 = root();
      var text_1 = child(p_1, true);
      reset(p_1);
      template_effect(($0) => set_text(text_1, $0), [() => t("This session reads no lorebook.")]);
      append($$anchor2, p_1);
    };
    var alternate = ($$anchor2) => {
      var fragment = root_8();
      var div_1 = first_child(fragment);
      var label = child(div_1);
      var span_1 = child(label);
      var text_2 = child(span_1, true);
      reset(span_1);
      var span_2 = sibling(span_1, 2);
      var sp_icon = child(span_2);
      set_custom_element_data(sp_icon, "name", "search");
      set_custom_element_data(sp_icon, "size", "14");
      reset(span_2);
      var input = sibling(span_2, 2);
      remove_input_defaults(input);
      reset(label);
      var button = sibling(label, 2);
      var sp_icon_1 = child(button);
      set_custom_element_data(sp_icon_1, "name", "refresh-cw");
      set_custom_element_data(sp_icon_1, "size", "14");
      reset(button);
      reset(div_1);
      var div_2 = sibling(div_1, 2);
      var div_3 = child(div_2);
      each(div_3, 21, () => LORE_ENTRIES_FILTERS, (f) => f.value, ($$anchor3, f) => {
        var label_1 = root_1();
        var input_1 = child(label_1);
        remove_input_defaults(input_1);
        var text_3 = sibling(input_1);
        reset(label_1);
        template_effect(
          ($0) => {
            set_attribute(input_1, "name", filterGroup);
            set_value(input_1, get(f).value);
            set_checked(input_1, get(filter) === get(f).value);
            set_text(text_3, ` ${$0 ?? ""}`);
          },
          [() => t(get(f).label)]
        );
        delegated("change", input_1, () => setFilter(get(f).value));
        append($$anchor3, label_1);
      });
      reset(div_3);
      var span_3 = sibling(div_3, 2);
      var sp_combobox = child(span_3);
      set_custom_element_data(sp_combobox, "data-widget-part", "lore-entries.sort-field");
      template_effect(($0) => set_custom_element_data(sp_combobox, "label", $0), [() => t("Sort")]);
      template_effect(() => set_custom_element_data(sp_combobox, "value", get(effectiveSort)));
      each(sp_combobox, 21, () => LORE_ENTRIES_SORTS, (o) => o.value, ($$anchor3, o) => {
        var sp_option = root_2();
        template_effect(() => set_custom_element_data(sp_option, "value", get(o).value));
        var text_4 = child(sp_option, true);
        reset(sp_option);
        template_effect(($0) => set_text(text_4, $0), [() => t(get(o).label)]);
        append($$anchor3, sp_option);
      });
      reset(sp_combobox);
      reset(span_3);
      reset(div_2);
      var node_1 = sibling(div_2, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var p_2 = root_3();
          var text_5 = child(p_2, true);
          reset(p_2);
          template_effect(() => set_text(text_5, get(readError)));
          append($$anchor3, p_2);
        };
        if_block(node_1, ($$render) => {
          if (get(readError)) $$render(consequent_2);
        });
      }
      var node_2 = sibling(node_1, 2);
      {
        var consequent_3 = ($$anchor3) => {
          var p_3 = root_3();
          var text_6 = child(p_3, true);
          reset(p_3);
          template_effect(() => set_text(text_6, get(markError)));
          append($$anchor3, p_3);
        };
        if_block(node_2, ($$render) => {
          if (get(markError)) $$render(consequent_3);
        });
      }
      var ul = sibling(node_2, 2);
      each(
        ul,
        21,
        () => get(answer)?.rows ?? [],
        (r) => r.id,
        ($$anchor3, r) => {
          var li = root_5();
          var span_4 = child(li);
          var span_5 = child(span_4);
          var text_7 = child(span_5, true);
          reset(span_5);
          var node_3 = sibling(span_5, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var span_6 = root_4();
              var text_8 = child(span_6, true);
              reset(span_6);
              template_effect(($0) => set_text(text_8, $0), [() => get(r).keys.join(t(", "))]);
              append($$anchor4, span_6);
            };
            if_block(node_3, ($$render) => {
              if (get(r).keys.length) $$render(consequent_4);
            });
          }
          var span_7 = sibling(node_3, 2);
          var text_9 = child(span_7, true);
          reset(span_7);
          reset(span_4);
          var span_8 = sibling(span_4, 2);
          var button_1 = child(span_8);
          var sp_icon_2 = child(button_1);
          set_custom_element_data(sp_icon_2, "name", "pin");
          set_custom_element_data(sp_icon_2, "size", "14");
          reset(button_1);
          var button_2 = sibling(button_1, 2);
          var sp_icon_3 = child(button_2);
          set_custom_element_data(sp_icon_3, "name", "circle-off");
          set_custom_element_data(sp_icon_3, "size", "14");
          reset(button_2);
          reset(span_8);
          reset(li);
          template_effect(
            ($0, $1, $2, $3, $4, $5) => {
              set_attribute(li, "data-entry-id", get(r).id);
              set_attribute(li, "data-off", get(r).off ? "" : void 0);
              set_text(text_7, $0);
              set_text(text_9, $1);
              set_attribute(button_1, "aria-pressed", get(r).pinned);
              set_attribute(button_1, "aria-label", $2);
              set_attribute(button_1, "title", $3);
              set_attribute(button_2, "aria-pressed", get(r).off);
              set_attribute(button_2, "aria-label", $4);
              set_attribute(button_2, "title", $5);
            },
            [
              () => loreEntryName(get(r), t),
              () => readLine(get(r)),
              () => t("Pin {name}").replace("{name}", get(r).title || t("entry {id}").replace("{id}", String(get(r).id))),
              () => get(r).pinned ? t("Pinned: always read") : t("Pin: always read"),
              () => t("Turn {name} off").replace("{name}", get(r).title || t("entry {id}").replace("{id}", String(get(r).id))),
              () => get(r).off ? t("Off: never read") : t("Turn off: never read")
            ]
          );
          delegated("click", button_1, () => setMark(get(r), "pinned"));
          delegated("click", button_2, () => setMark(get(r), "off"));
          append($$anchor3, li);
        },
        ($$anchor3) => {
          var fragment_1 = comment();
          var node_4 = first_child(fragment_1);
          {
            var consequent_5 = ($$anchor4) => {
              var li_1 = root_6();
              var text_10 = child(li_1, true);
              reset(li_1);
              template_effect(($0) => set_text(text_10, $0), [() => loreEntriesEmptyLine(get(query), get(filter), t)]);
              append($$anchor4, li_1);
            };
            if_block(node_4, ($$render) => {
              if (get(answer)) $$render(consequent_5);
            });
          }
          append($$anchor3, fragment_1);
        }
      );
      reset(ul);
      var node_5 = sibling(ul, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_4 = root_7();
          var button_3 = child(div_4);
          var text_11 = child(button_3, true);
          reset(button_3);
          var span_9 = sibling(button_3, 2);
          var text_12 = child(span_9, true);
          reset(span_9);
          var button_4 = sibling(span_9, 2);
          var text_13 = child(button_4, true);
          reset(button_4);
          reset(div_4);
          template_effect(
            ($0, $1, $2) => {
              button_3.disabled = !get(span).hasPrevious;
              set_text(text_11, $0);
              set_text(text_12, $1);
              button_4.disabled = !get(span).hasNext;
              set_text(text_13, $2);
            },
            [
              () => t("Previous"),
              () => t("{from}\u2013{to} of {total}").replace("{from}", String(get(span).from)).replace("{to}", String(get(span).to)).replace("{total}", String(get(span).total)),
              () => t("Next")
            ]
          );
          delegated("click", button_3, () => set(offset, get(span).previousOffset, true));
          delegated("click", button_4, () => set(offset, get(span).nextOffset, true));
          append($$anchor3, div_4);
        };
        if_block(node_5, ($$render) => {
          if (get(span)?.paged) $$render(consequent_6);
        });
      }
      template_effect(
        ($0, $1, $2, $3, $4, $5) => {
          set_text(text_2, $0);
          set_attribute(input, "placeholder", $1);
          set_value(input, get(query));
          set_attribute(button, "aria-label", $2);
          set_attribute(button, "title", $3);
          set_attribute(div_3, "aria-label", $4);
          set_attribute(ul, "aria-label", $5);
        },
        [
          () => t("Search entries by title or key"),
          () => get(answer) ? t("Search {total} entries").replace("{total}", String(get(answer).total)) : t("Search entries"),
          () => t("Refresh"),
          () => t("Refresh"),
          () => t("Show"),
          () => t("Lore entries")
        ]
      );
      delegated("input", input, (e) => {
        set(query, e.currentTarget.value, true);
        set(offset, 0);
      });
      delegated("click", button, refresh);
      delegated("change", sp_combobox, (e) => {
        const next = LORE_ENTRIES_SORTS.find((s) => s.value === e.detail.value);
        if (!next) return;
        set(sort, next.value, true);
        set(offset, 0);
      });
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(answer)?.ownerOnly) $$render(consequent);
      else if (get(answer) && get(answer).lorebookId === null) $$render(consequent_1, 1);
      else $$render(alternate, -1);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}
delegate(["input", "click", "change"]);

// components/sessions/lore-entries/LoreEntries.svelte
function LoreEntries($$anchor, $$props) {
  push($$props, true);
  let settled = state(untrack(() => $$props.ctx.settings) !== void 0);
  user_effect(() => untrack(() => $$props.ctx).subscribe((section) => {
    if (section === "settings") set(settled, true);
  }));
  setContext(WIDGET_CONTEXT_KEY, widgetRefFromComponent(untrack(() => $$props.ctx), {
    id: "lore-entries",
    instanceId: "lore-entries",
    title: "Lore entries"
  }));
  LoreEntriesWidget($$anchor, {
    get ready() {
      return get(settled);
    }
  });
  pop();
}

// components/sessions/lore-entries/lore-entries.ts
var lore_entries_default = svelteComponent(LoreEntries);
export {
  lore_entries_default as default
};
