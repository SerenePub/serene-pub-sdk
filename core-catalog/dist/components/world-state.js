import {
  SlotControl,
  createEntryFinder,
  createSlotWriter,
  worldStateView
} from "./shared-AINANAIA.js";
import "./shared-TCQZXBE3.js";
import "./shared-RJDGOAVC.js";
import {
  WIDGET_CONTEXT_KEY,
  append,
  child,
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

// components/sessions/world-state/WorldStateWidget.svelte
var root = from_html(`<p data-widget-part="world-state.alert" role="alert"> </p>`);
var root_1 = from_html(`<div data-widget-part="world-state.empty empty" role="status" data-scope-not-granted="session:state"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_2 = from_html(`<div data-widget-part="world-state.empty empty" role="status"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_3 = from_html(`<div data-widget-part="world-state.empty empty"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_4 = from_html(`<section data-widget-part="world-state.place"><header data-widget-part="world-state.place-head"><sp-icon></sp-icon> <span data-widget-part="world-state.place-name"> </span></header> <!></section>`, 2);
var root_5 = from_html(`<!> <!>`, 1);
var root_6 = from_html(`<div data-widget-part="world-state.root" data-state-widget="world-state" data-owner-key="world"><!> <!> <!></div>`);
function WorldStateWidget($$anchor, $$props) {
  push($$props, true);
  const widget = useWidgetContext();
  const writer = createSlotWriter(widget);
  const t = (source) => widget?.current.t(source) ?? source;
  const findEntries = createEntryFinder(widget, t);
  let section = user_derived(() => widget?.current.session_state?.v1);
  let settings = user_derived(() => widget?.current.settings.v1 ?? {});
  let view = user_derived(() => worldStateView(get(section), get(settings), widget?.current.grants?.includes("session:state")));
  var div = root_6();
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
      set_custom_element_data(sp_icon, "size", "16");
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
      set_custom_element_data(sp_icon_1, "name", "cloud-sun");
      set_custom_element_data(sp_icon_1, "size", "16");
      var span_1 = sibling(sp_icon_1, 2);
      var text_3 = child(span_1, true);
      reset(span_1);
      reset(div_2);
      template_effect(($0) => set_text(text_3, $0), [() => t("Loading the world's stats\u2026")]);
      append($$anchor2, div_2);
    };
    var consequent_4 = ($$anchor2) => {
    };
    var consequent_5 = ($$anchor2) => {
      var div_3 = root_3();
      var sp_icon_2 = child(div_3);
      set_custom_element_data(sp_icon_2, "name", "cloud-sun");
      set_custom_element_data(sp_icon_2, "size", "16");
      var span_2 = sibling(sp_icon_2, 2);
      var text_4 = child(span_2, true);
      reset(span_2);
      reset(div_3);
      template_effect(($0) => set_text(text_4, $0), [
        () => get(view).reason === "none-shown" ? t("This session's world declares no stats to show here.") : t("Nothing in this session declares world stats. A genre or an extension adds them.")
      ]);
      append($$anchor2, div_3);
    };
    var alternate = ($$anchor2) => {
      const owner = user_derived(() => get(view).owner);
      var fragment = root_5();
      var node_3 = first_child(fragment);
      each(node_3, 17, () => get(view).slots, (shown) => shown.slot.slotId, ($$anchor3, shown) => {
        {
          let $0 = user_derived(() => get(view).layout === "strip" ? "compact" : "full");
          SlotControl($$anchor3, {
            get slot() {
              return get(shown).slot;
            },
            get density() {
              return get($0);
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
            onset: (next) => void writer.set(get(owner), get(shown).slot.slotId, next)
          });
        }
      });
      var node_4 = sibling(node_3, 2);
      each(node_4, 17, () => get(view).places, (place) => place.owner.key, ($$anchor3, place) => {
        var section_1 = root_4();
        var header = child(section_1);
        var sp_icon_3 = child(header);
        set_custom_element_data(sp_icon_3, "name", "map-pin");
        set_custom_element_data(sp_icon_3, "size", "13");
        var span_3 = sibling(sp_icon_3, 2);
        var text_5 = child(span_3, true);
        reset(span_3);
        reset(header);
        var node_5 = sibling(header, 2);
        each(node_5, 17, () => get(place).slots, (shown) => shown.slot.slotId, ($$anchor4, shown) => {
          {
            let $0 = user_derived(() => get(view).layout === "strip" ? "compact" : "full");
            SlotControl($$anchor4, {
              get slot() {
                return get(shown).slot;
              },
              get density() {
                return get($0);
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
              onset: (next) => void writer.set(get(place).owner, get(shown).slot.slotId, next)
            });
          }
        });
        reset(section_1);
        template_effect(() => {
          set_attribute(section_1, "data-owner-key", get(place).owner.key);
          set_attribute(section_1, "aria-label", get(place).owner.label);
          set_text(text_5, get(place).owner.label);
        });
        append($$anchor3, section_1);
      });
      append($$anchor2, fragment);
    };
    if_block(node_2, ($$render) => {
      if (get(view).status === "not-granted") $$render(consequent_2);
      else if (get(view).status === "loading") $$render(consequent_3, 1);
      else if (get(view).status === "failed") $$render(consequent_4, 2);
      else if (get(view).status === "empty") $$render(consequent_5, 3);
      else $$render(alternate, -1);
    });
  }
  reset(div);
  template_effect(() => set_attribute(div, "data-layout", get(view).layout === "strip" ? "strip" : "list"));
  append($$anchor, div);
  pop();
}

// components/sessions/world-state/WorldState.svelte
function WorldState($$anchor, $$props) {
  push($$props, true);
  setContext(WIDGET_CONTEXT_KEY, widgetRefFromComponent(untrack(() => $$props.ctx), {
    id: "world-state",
    instanceId: "world-state",
    title: "World State"
  }));
  WorldStateWidget($$anchor, {});
  pop();
}

// components/sessions/world-state/world-state.ts
var world_state_default = svelteComponent(WorldState);
export {
  world_state_default as default
};
