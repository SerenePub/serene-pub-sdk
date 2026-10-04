import {
  SlotControl,
  createEntryFinder,
  createSlotWriter,
  statsView
} from "./shared-AINANAIA.js";
import "./shared-TCQZXBE3.js";
import "./shared-RJDGOAVC.js";
import {
  WIDGET_CONTEXT_KEY,
  append,
  child,
  comment,
  each,
  first_child,
  from_html,
  get,
  if_block,
  pop,
  push,
  reset,
  setContext,
  set_attribute,
  set_custom_element_data,
  set_text,
  sibling,
  svelteComponent,
  template_effect,
  untrack,
  useWidgetContext,
  user_derived,
  widgetRefFromComponent
} from "./shared-UAQVMZZK.js";

// components/sessions/stats/StatsWidget.svelte
var root = from_html(`<p data-widget-part="stats.alert" role="alert"> </p>`);
var root_1 = from_html(`<div data-widget-part="stats.empty empty" role="status" data-scope-not-granted="session:state"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_2 = from_html(`<div data-widget-part="stats.empty empty" role="status"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_3 = from_html(`<div data-widget-part="stats.empty empty"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_4 = from_html(`<p data-widget-part="stats.card-note"> </p>`);
var root_5 = from_html(`<div data-widget-part="stats.card-body list"></div>`);
var root_6 = from_html(`<section data-widget-part="stats.card card"><header data-widget-part="stats.card-head card-head"><sp-icon></sp-icon> <span data-widget-part="stats.card-name"> </span></header> <!></section>`, 2);
var root_7 = from_html(`<div data-widget-part="stats.root" data-state-widget="stats"><!> <!> <!></div>`);
function StatsWidget($$anchor, $$props) {
  push($$props, true);
  const widget = useWidgetContext();
  const writer = createSlotWriter(widget);
  const t = (source) => widget?.current.t(source) ?? source;
  const findEntries = createEntryFinder(widget, t);
  let section = user_derived(() => widget?.current.session_state?.v1);
  let settings = user_derived(() => widget?.current.settings.v1 ?? {});
  let view = user_derived(() => statsView(get(section), get(settings), widget?.current.grants?.includes("session:state")));
  var div = root_7();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var p = root();
      var text = child(p, true);
      reset(p);
      template_effect(() => set_text(text, get(section).error));
      append($$anchor2, p);
    };
    if_block(node, ($$render) => {
      if (get(section)?.error) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var p_1 = root();
      var text_1 = child(p_1, true);
      reset(p_1);
      template_effect(() => set_text(text_1, writer.error));
      append($$anchor2, p_1);
    };
    if_block(node_1, ($$render) => {
      if (writer.error) $$render(consequent_1);
    });
  }
  var node_2 = sibling(node_1, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_1 = root_1();
      var sp_icon = child(div_1);
      set_custom_element_data(sp_icon, "name", "lock");
      set_custom_element_data(sp_icon, "size", "20");
      var span = sibling(sp_icon, 2);
      var text_2 = child(span, true);
      reset(span);
      reset(div_1);
      template_effect(($0) => set_text(text_2, $0), [
        () => t("This widget has not been granted the session's stats. An administrator can grant it in the extension's permissions.")
      ]);
      append($$anchor2, div_1);
    };
    var consequent_3 = ($$anchor2) => {
      var div_2 = root_2();
      var sp_icon_1 = child(div_2);
      set_custom_element_data(sp_icon_1, "name", "heart-pulse");
      set_custom_element_data(sp_icon_1, "size", "20");
      var span_1 = sibling(sp_icon_1, 2);
      var text_3 = child(span_1, true);
      reset(span_1);
      reset(div_2);
      template_effect(($0) => set_text(text_3, $0), [() => t("Loading the cast's stats\u2026")]);
      append($$anchor2, div_2);
    };
    var consequent_4 = ($$anchor2) => {
    };
    var consequent_5 = ($$anchor2) => {
      var div_3 = root_3();
      var sp_icon_2 = child(div_3);
      set_custom_element_data(sp_icon_2, "name", "heart-pulse");
      set_custom_element_data(sp_icon_2, "size", "20");
      var span_2 = sibling(sp_icon_2, 2);
      var text_4 = child(span_2, true);
      reset(span_2);
      reset(div_3);
      template_effect(($0) => set_text(text_4, $0), [
        () => t("Nothing in this session declares stats. A genre, an extension or an administrator adds them, and they show up here.")
      ]);
      append($$anchor2, div_3);
    };
    var consequent_6 = ($$anchor2) => {
      var div_4 = root_3();
      var sp_icon_3 = child(div_4);
      set_custom_element_data(sp_icon_3, "name", "heart-pulse");
      set_custom_element_data(sp_icon_3, "size", "20");
      var span_3 = sibling(sp_icon_3, 2);
      var text_5 = child(span_3, true);
      reset(span_3);
      reset(div_4);
      template_effect(($0) => set_text(text_5, $0), [
        () => get(view).members === "pick" ? t("No cast member matches the names in this widget's settings.") : t("No one in the cast has a stat in play yet. Set one on a cast member's page, or let the story change one.")
      ]);
      append($$anchor2, div_4);
    };
    var alternate_1 = ($$anchor2) => {
      const density = user_derived(() => get(view).density);
      var fragment = comment();
      var node_3 = first_child(fragment);
      each(node_3, 17, () => get(view).members, (member) => member.owner.key, ($$anchor3, member) => {
        var section_1 = root_6();
        var header = child(section_1);
        var sp_icon_4 = child(header);
        set_custom_element_data(sp_icon_4, "name", "user-round");
        set_custom_element_data(sp_icon_4, "size", "13");
        var span_4 = sibling(sp_icon_4, 2);
        var text_6 = child(span_4, true);
        reset(span_4);
        reset(header);
        var node_4 = sibling(header, 2);
        {
          var consequent_7 = ($$anchor4) => {
            var p_2 = root_4();
            var text_7 = child(p_2, true);
            reset(p_2);
            template_effect(($0) => set_text(text_7, $0), [() => t("No stats to show for this member.")]);
            append($$anchor4, p_2);
          };
          var alternate = ($$anchor4) => {
            var div_5 = root_5();
            each(div_5, 21, () => get(member).slots, (shown) => shown.slot.slotId, ($$anchor5, shown) => {
              SlotControl($$anchor5, {
                get slot() {
                  return get(shown).slot;
                },
                get density() {
                  return get(density);
                },
                get config() {
                  return get(shown).config;
                },
                get value() {
                  return get(shown).value;
                },
                t,
                get findEntries() {
                  return findEntries;
                },
                onset: (next) => void writer.set(get(member).owner, get(shown).slot.slotId, next)
              });
            });
            reset(div_5);
            template_effect(() => set_attribute(div_5, "data-density", get(density)));
            append($$anchor4, div_5);
          };
          if_block(node_4, ($$render) => {
            if (!get(member).slots.length) $$render(consequent_7);
            else $$render(alternate, -1);
          });
        }
        reset(section_1);
        template_effect(() => {
          set_attribute(section_1, "data-owner-key", get(member).owner.key);
          set_attribute(section_1, "aria-label", get(member).owner.label);
          set_text(text_6, get(member).owner.label);
        });
        append($$anchor3, section_1);
      });
      append($$anchor2, fragment);
    };
    if_block(node_2, ($$render) => {
      if (get(view).status === "not-granted") $$render(consequent_2);
      else if (get(view).status === "loading") $$render(consequent_3, 1);
      else if (get(view).status === "failed") $$render(consequent_4, 2);
      else if (get(view).status === "none-declared") $$render(consequent_5, 3);
      else if (get(view).status === "no-members") $$render(consequent_6, 4);
      else $$render(alternate_1, -1);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}

// components/sessions/stats/Stats.svelte
function Stats($$anchor, $$props) {
  push($$props, true);
  setContext(WIDGET_CONTEXT_KEY, widgetRefFromComponent(untrack(() => $$props.ctx), { id: "stats", instanceId: "stats", title: "Stats" }));
  StatsWidget($$anchor, {});
  pop();
}

// components/sessions/stats/stats.ts
var stats_default = svelteComponent(Stats);
export {
  stats_default as default
};
