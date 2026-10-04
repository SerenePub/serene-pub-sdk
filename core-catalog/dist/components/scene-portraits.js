import {
  barView,
  slotKind
} from "./shared-TCQZXBE3.js";
import "./shared-RJDGOAVC.js";
import {
  WIDGET_CONTEXT_KEY,
  append,
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
  push,
  reset,
  scopeNotGranted,
  set,
  setContext,
  set_attribute,
  set_custom_element_data,
  set_style,
  set_text,
  sibling,
  state,
  svelteComponent,
  template_effect,
  untrack,
  useWidgetContext,
  user_derived,
  widgetRefFromComponent
} from "./shared-UAQVMZZK.js";

// dist/ui/sessions/scene-portraits/portraits.js
var SCENE_PORTRAITS_DEFAULTS = Object.freeze({
  source: "pinned",
  persona: false,
  bars: false,
  sprites: true
});
function readScenePortraitsSettings(raw) {
  const v = raw ?? {};
  const d = SCENE_PORTRAITS_DEFAULTS;
  return {
    source: v.source === "scene" || v.source === "pinned" ? v.source : d.source,
    persona: typeof v.persona === "boolean" ? v.persona : d.persona,
    bars: typeof v.bars === "boolean" ? v.bars : d.bars,
    sprites: typeof v.sprites === "boolean" ? v.sprites : d.sprites
  };
}
function stateOwnerKeyOf(state2, characterId) {
  return state2?.owners.find((o) => o.kind === "session_cast" && o.id === characterId)?.key ?? null;
}
function scenePortraitsOf(characters, state2, settings) {
  const members = characters?.members ?? [];
  const out = [];
  for (const m of members) {
    if (m.isPersona)
      continue;
    out.push({
      key: m.ref,
      characterId: m.characterId,
      isPersona: false,
      name: m.name,
      src: settings.sprites ? m.sprite ?? m.face : m.face,
      ownerKey: stateOwnerKeyOf(state2, m.characterId),
      spriteSets: m.spriteSets,
      spriteSetOverride: m.spriteSetOverride ?? null,
      offersSpriteSets: settings.sprites && m.canChangeSpriteSet && m.spriteSets.length > 1
    });
  }
  if (!settings.persona)
    return out;
  const mine = members.find((m) => m.isPersona && m.mine);
  if (mine)
    out.push({
      key: mine.ref,
      characterId: mine.characterId,
      isPersona: true,
      name: mine.name,
      src: mine.face,
      ownerKey: null,
      spriteSets: [],
      spriteSetOverride: null,
      offersSpriteSets: false
    });
  return out;
}
var characterIdOf = (ref) => {
  const m = /^character:(\d+)$/.exec(ref ?? "");
  return m ? Number(m[1]) : null;
};
function pinnedPortraitsOf(characters, state2) {
  return ["left", "right"].map((side) => {
    const pin = characters?.sceneImages[side] ?? null;
    const id = characterIdOf(pin?.ref);
    return { side, src: pin?.src ?? null, ownerKey: id == null ? null : stateOwnerKeyOf(state2, id) };
  });
}
function statBarsOf(state2, ownerKey, limit = 3) {
  if (!state2)
    return [];
  const owner = state2.owners.find((o) => o.key === ownerKey);
  if (!owner)
    return [];
  const bag = ownerKey === "world" ? state2.resolved.world : state2.resolved.cast[ownerKey] ?? {};
  const out = [];
  for (const slot of state2.slots) {
    if (!Object.hasOwn(owner.configs, slot.slotId))
      continue;
    if (slotKind(slot) !== "number")
      continue;
    const bar = barView(bag[slot.qualifiedKey], owner.configs[slot.slotId]);
    if (bar)
      out.push({ slotId: slot.slotId, label: slot.label, bar });
    if (out.length >= limit)
      break;
  }
  return out;
}

// components/sessions/scene-portraits/StatBars.svelte
var root = from_html(`<div data-widget-part="scene-portraits.bar row"><span data-widget-part="scene-portraits.bar-label label"> </span> <span data-widget-part="scene-portraits.bar-track meter"><span data-widget-part="scene-portraits.bar-fill"></span></span></div>`);
var root_1 = from_html(`<div data-widget-part="scene-portraits.bars list"></div>`);
function StatBars($$anchor, $$props) {
  push($$props, true);
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root_1();
      each(div, 21, () => $$props.rows, (row) => row.slotId, ($$anchor3, row) => {
        var div_1 = root();
        var span = child(div_1);
        var text = child(span, true);
        reset(span);
        var span_1 = sibling(span, 2);
        var span_2 = child(span_1);
        reset(span_1);
        reset(div_1);
        template_effect(() => {
          set_attribute(div_1, "title", `${get(row).label ?? ""} ${get(row).bar.label ?? ""}`);
          set_attribute(div_1, "aria-label", `${get(row).label ?? ""} ${get(row).bar.label ?? ""}`);
          set_text(text, get(row).label);
          set_style(span_2, `--sp-fill: ${get(row).bar.percent ?? ""}%`);
        });
        append($$anchor3, div_1);
      });
      reset(div);
      template_effect(() => set_attribute(div, "data-state-bars", $$props.ownerKey));
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.rows.length) $$render(consequent);
    });
  }
  append($$anchor, fragment);
  pop();
}

// components/sessions/scene-portraits/ScenePortraitsWidget.svelte
var root2 = from_html(`<div data-widget-part="scene-portraits.alert" role="alert"><span data-widget-part="scene-portraits.alert-text"> </span> <button type="button" data-widget-part="scene-portraits.dismiss"><sp-icon></sp-icon></button></div>`, 2);
var root_12 = from_html(`<div data-widget-part="scene-portraits.empty empty" role="status" data-scope-not-granted="characters"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_2 = from_html(`<div data-widget-part="scene-portraits.empty empty"><sp-icon></sp-icon> <span> </span></div>`, 2);
var root_3 = from_html(`<img data-widget-part="scene-portraits.face-img"/>`);
var root_4 = from_html(`<div data-widget-part="scene-portraits.face-img" data-blank=""><sp-icon></sp-icon></div>`, 2);
var root_5 = from_html(`<button type="button" role="menuitemradio" data-widget-part="scene-portraits.set-option"><span> </span></button>`);
var root_6 = from_html(`<sp-popover><button slot="trigger" type="button" data-widget-part="scene-portraits.set"><sp-icon></sp-icon> <span data-widget-part="scene-portraits.set-name"> </span></button> <div data-widget-part="scene-portraits.set-panel"><header data-widget-part="scene-portraits.set-title"><sp-icon></sp-icon> <p> </p></header> <div data-widget-part="scene-portraits.set-list" role="menu"><!> <button type="button" role="menuitemradio" data-widget-part="scene-portraits.set-option"><span> </span></button></div> <p data-widget-part="scene-portraits.set-note"> </p></div></sp-popover>`, 2);
var root_7 = from_html(`<div data-widget-part="scene-portraits.face"><!> <span data-widget-part="scene-portraits.face-name"> </span> <!> <!></div>`);
var root_8 = from_html(`<div data-widget-part="scene-portraits.scene"></div>`);
var root_9 = from_html(`<img data-widget-part="scene-portraits.pin-img"/> <!> <button type="button" data-widget-part="scene-portraits.pin-clear"><sp-icon></sp-icon></button>`, 3);
var root_10 = from_html(`<div data-widget-part="scene-portraits.pin-placeholder"> </div>`);
var root_11 = from_html(`<div data-widget-part="scene-portraits.pin"><!></div>`);
var root_122 = from_html(`<div data-widget-part="scene-portraits.pins"></div>`);
var root_13 = from_html(`<div data-widget-part="scene-portraits.root" data-state-widget="scene-portraits"><!> <!></div>`);
function ScenePortraitsWidget($$anchor, $$props) {
  push($$props, true);
  const w = useWidgetContext();
  const t = (source) => w?.current.t?.(source) ?? source;
  const settings = user_derived(() => readScenePortraitsSettings(w?.current.settings?.v1));
  const characters = user_derived(() => w?.current.characters?.v1);
  const sessionState = user_derived(() => w?.current.session_state?.v1);
  const castNotGranted = user_derived(() => scopeNotGranted(w?.current, "characters"));
  const fromScene = user_derived(() => get(settings).source === "scene");
  const portraits = user_derived(() => scenePortraitsOf(get(characters), get(sessionState), get(settings)));
  const pins = user_derived(() => pinnedPortraitsOf(get(characters), get(sessionState)));
  const hasAny = user_derived(() => get(pins).some((p) => !!p.src));
  let error = state(null);
  const messageOf = (e) => e instanceof Error ? e.message : String(e ?? t("Something went wrong"));
  let menuFor = state(null);
  async function changeSpriteSet(characterId, set2) {
    set(menuFor, null);
    try {
      await w?.current.request("set-sprite-set", { characterId, set: set2 });
      set(error, null);
    } catch (e) {
      set(error, messageOf(e), true);
    }
  }
  async function clear(side) {
    try {
      await w?.current.request("clear-scene-image", { side });
      set(error, null);
    } catch (e) {
      set(error, messageOf(e), true);
    }
  }
  var div = root_13();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root2();
      var span = child(div_1);
      var text = child(span, true);
      reset(span);
      var button = sibling(span, 2);
      var sp_icon = child(button);
      set_custom_element_data(sp_icon, "name", "x");
      set_custom_element_data(sp_icon, "size", "12");
      reset(button);
      reset(div_1);
      template_effect(
        ($0, $1) => {
          set_text(text, get(error));
          set_attribute(button, "aria-label", $0);
          set_attribute(button, "title", $1);
        },
        [() => t("Dismiss"), () => t("Dismiss")]
      );
      delegated("click", button, () => set(error, null));
      append($$anchor2, div_1);
    };
    if_block(node, ($$render) => {
      if (get(error)) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_12();
      var sp_icon_1 = child(div_2);
      set_custom_element_data(sp_icon_1, "name", "lock");
      set_custom_element_data(sp_icon_1, "size", "22");
      var span_1 = sibling(sp_icon_1, 2);
      var text_1 = child(span_1, true);
      reset(span_1);
      reset(div_2);
      template_effect(($0) => set_text(text_1, $0), [
        () => t("This widget has not been granted the session's cast. An administrator can grant it in the extension's permissions.")
      ]);
      append($$anchor2, div_2);
    };
    var consequent_2 = ($$anchor2) => {
    };
    var consequent_7 = ($$anchor2) => {
      var fragment = comment();
      var node_2 = first_child(fragment);
      {
        var consequent_3 = ($$anchor3) => {
          var div_3 = root_2();
          var sp_icon_2 = child(div_3);
          set_custom_element_data(sp_icon_2, "name", "users");
          set_custom_element_data(sp_icon_2, "size", "22");
          var span_2 = sibling(sp_icon_2, 2);
          var text_2 = child(span_2, true);
          reset(span_2);
          reset(div_3);
          template_effect(($0) => set_text(text_2, $0), [
            () => t("Nobody is in this scene yet. Add a character to the session and they show up here.")
          ]);
          append($$anchor3, div_3);
        };
        var alternate_1 = ($$anchor3) => {
          var div_4 = root_8();
          each(div_4, 21, () => get(portraits), (member) => member.key, ($$anchor4, member) => {
            var div_5 = root_7();
            var node_3 = child(div_5);
            {
              var consequent_4 = ($$anchor5) => {
                var img = root_3();
                template_effect(() => {
                  set_attribute(img, "src", get(member).src);
                  set_attribute(img, "alt", get(member).name);
                });
                append($$anchor5, img);
              };
              var alternate = ($$anchor5) => {
                var div_6 = root_4();
                var sp_icon_3 = child(div_6);
                set_custom_element_data(sp_icon_3, "name", "user-round");
                set_custom_element_data(sp_icon_3, "size", "20");
                reset(div_6);
                append($$anchor5, div_6);
              };
              if_block(node_3, ($$render) => {
                if (get(member).src) $$render(consequent_4);
                else $$render(alternate, -1);
              });
            }
            var span_3 = sibling(node_3, 2);
            var text_3 = child(span_3, true);
            reset(span_3);
            var node_4 = sibling(span_3, 2);
            {
              var consequent_5 = ($$anchor5) => {
                var sp_popover = root_6();
                set_custom_element_data(sp_popover, "data-widget-part", "scene-portraits.set-menu");
                set_custom_element_data(sp_popover, "placement", "bottom-end");
                template_effect(($0) => set_custom_element_data(sp_popover, "label", $0), [() => t("Sprite set")]);
                template_effect(() => set_custom_element_data(sp_popover, "open", get(menuFor) === get(member).key));
                var button_1 = child(sp_popover);
                var sp_icon_4 = child(button_1);
                set_custom_element_data(sp_icon_4, "name", "shirt");
                set_custom_element_data(sp_icon_4, "size", "12");
                var span_4 = sibling(sp_icon_4, 2);
                var text_4 = child(span_4, true);
                reset(span_4);
                reset(button_1);
                var div_7 = sibling(button_1, 2);
                var header = child(div_7);
                var sp_icon_5 = child(header);
                set_custom_element_data(sp_icon_5, "name", "shirt");
                set_custom_element_data(sp_icon_5, "size", "16");
                var p_1 = sibling(sp_icon_5, 2);
                var text_5 = child(p_1, true);
                reset(p_1);
                reset(header);
                var div_8 = sibling(header, 2);
                var node_5 = child(div_8);
                each(node_5, 16, () => get(member).spriteSets, (setName) => setName, ($$anchor6, setName) => {
                  var button_2 = root_5();
                  var span_5 = child(button_2);
                  var text_6 = child(span_5, true);
                  reset(span_5);
                  reset(button_2);
                  template_effect(() => {
                    set_attribute(button_2, "aria-checked", get(member).spriteSetOverride === setName);
                    set_text(text_6, setName);
                  });
                  delegated("click", button_2, () => changeSpriteSet(get(member).characterId, setName));
                  append($$anchor6, button_2);
                });
                var button_3 = sibling(node_5, 2);
                var span_6 = child(button_3);
                var text_7 = child(span_6, true);
                reset(span_6);
                reset(button_3);
                reset(div_8);
                var p_2 = sibling(div_8, 2);
                var text_8 = child(p_2, true);
                reset(p_2);
                reset(div_7);
                reset(sp_popover);
                template_effect(
                  ($0, $1, $2, $3, $4, $5) => {
                    set_attribute(button_1, "aria-label", $0);
                    set_text(text_4, $1);
                    set_text(text_5, $2);
                    set_attribute(div_8, "aria-label", $3);
                    set_attribute(button_3, "aria-checked", !get(member).spriteSetOverride);
                    set_text(text_7, $4);
                    set_text(text_8, $5);
                  },
                  [
                    () => t("Change {name}'s sprite set").replace("{name}", get(member).name),
                    () => get(member).spriteSetOverride ?? t("Sprite set"),
                    () => t("Sprite set"),
                    () => t("Sprite set"),
                    () => t("As the story has it"),
                    () => t("For this session only. An outfit, an age or a form; the lorebook's cast decides it everywhere else.")
                  ]
                );
                event("open-change", sp_popover, (e) => set(menuFor, e.detail.open ? get(member).key : null, true));
                delegated("click", button_3, () => changeSpriteSet(get(member).characterId, null));
                append($$anchor5, sp_popover);
              };
              if_block(node_4, ($$render) => {
                if (get(member).offersSpriteSets) $$render(consequent_5);
              });
            }
            var node_6 = sibling(node_4, 2);
            {
              var consequent_6 = ($$anchor5) => {
                {
                  let $0 = user_derived(() => statBarsOf(get(sessionState), get(member).ownerKey));
                  StatBars($$anchor5, {
                    get ownerKey() {
                      return get(member).ownerKey;
                    },
                    get rows() {
                      return get($0);
                    }
                  });
                }
              };
              if_block(node_6, ($$render) => {
                if (get(settings).bars && get(member).ownerKey) $$render(consequent_6);
              });
            }
            reset(div_5);
            template_effect(() => {
              set_attribute(div_5, "data-scene-member", get(member).isPersona ? `persona:${get(member).characterId}` : get(member).key);
              set_text(text_3, get(member).name);
            });
            append($$anchor4, div_5);
          });
          reset(div_4);
          append($$anchor3, div_4);
        };
        if_block(node_2, ($$render) => {
          if (!get(portraits).length) $$render(consequent_3);
          else $$render(alternate_1, -1);
        });
      }
      append($$anchor2, fragment);
    };
    var consequent_8 = ($$anchor2) => {
      var div_9 = root_2();
      var sp_icon_6 = child(div_9);
      set_custom_element_data(sp_icon_6, "name", "users");
      set_custom_element_data(sp_icon_6, "size", "22");
      var span_7 = sibling(sp_icon_6, 2);
      var text_9 = child(span_7, true);
      reset(span_7);
      reset(div_9);
      template_effect(($0) => set_text(text_9, $0), [
        () => t("No scene portraits set. Click a character's avatar in the chat to pin one here.")
      ]);
      append($$anchor2, div_9);
    };
    var alternate_3 = ($$anchor2) => {
      var div_10 = root_122();
      each(div_10, 21, () => get(pins), (pin) => pin.side, ($$anchor3, pin) => {
        const ownerKey = user_derived(() => get(settings).bars ? get(pin).ownerKey : null);
        var div_11 = root_11();
        var node_7 = child(div_11);
        {
          var consequent_10 = ($$anchor4) => {
            var fragment_2 = root_9();
            var img_1 = first_child(fragment_2);
            var node_8 = sibling(img_1, 2);
            {
              var consequent_9 = ($$anchor5) => {
                {
                  let $0 = user_derived(() => statBarsOf(get(sessionState), get(ownerKey)));
                  StatBars($$anchor5, {
                    get ownerKey() {
                      return get(ownerKey);
                    },
                    get rows() {
                      return get($0);
                    }
                  });
                }
              };
              if_block(node_8, ($$render) => {
                if (get(ownerKey)) $$render(consequent_9);
              });
            }
            var button_4 = sibling(node_8, 2);
            var sp_icon_7 = child(button_4);
            set_custom_element_data(sp_icon_7, "name", "x");
            set_custom_element_data(sp_icon_7, "size", "13");
            reset(button_4);
            template_effect(
              ($0, $1, $2) => {
                set_attribute(img_1, "src", get(pin).src);
                set_attribute(img_1, "alt", $0);
                set_attribute(button_4, "title", $1);
                set_attribute(button_4, "aria-label", $2);
              },
              [
                () => get(pin).side === "left" ? t("left scene portrait") : t("right scene portrait"),
                () => get(pin).side === "left" ? t("Clear left portrait") : t("Clear right portrait"),
                () => get(pin).side === "left" ? t("Clear left portrait") : t("Clear right portrait")
              ]
            );
            delegated("click", button_4, () => clear(get(pin).side));
            append($$anchor4, fragment_2);
          };
          var alternate_2 = ($$anchor4) => {
            var div_12 = root_10();
            var text_10 = child(div_12, true);
            reset(div_12);
            template_effect(($0) => set_text(text_10, $0), [() => t("Empty")]);
            append($$anchor4, div_12);
          };
          if_block(node_7, ($$render) => {
            if (get(pin).src) $$render(consequent_10);
            else $$render(alternate_2, -1);
          });
        }
        reset(div_11);
        append($$anchor3, div_11);
      });
      reset(div_10);
      append($$anchor2, div_10);
    };
    if_block(node_1, ($$render) => {
      if (get(castNotGranted)) $$render(consequent_1);
      else if (!get(characters)) $$render(consequent_2, 1);
      else if (get(fromScene)) $$render(consequent_7, 2);
      else if (!get(hasAny)) $$render(consequent_8, 3);
      else $$render(alternate_3, -1);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}
delegate(["click"]);

// components/sessions/scene-portraits/ScenePortraits.svelte
function ScenePortraits($$anchor, $$props) {
  push($$props, true);
  setContext(WIDGET_CONTEXT_KEY, widgetRefFromComponent(untrack(() => $$props.ctx), {
    id: "scene-portraits",
    instanceId: "scene-portraits",
    title: "Scene Portraits"
  }));
  ScenePortraitsWidget($$anchor, {});
  pop();
}

// components/sessions/scene-portraits/scene-portraits.ts
var scene_portraits_default = svelteComponent(ScenePortraits);
export {
  scene_portraits_default as default
};
