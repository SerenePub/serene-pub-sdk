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
  proxy,
  push,
  remove_input_defaults,
  remove_textarea_child,
  reset,
  set,
  setContext,
  set_attribute,
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
} from "./shared-UAQVMZZK.js";

// dist/ui/sessions/authors-note/index.js
var AUTHORS_NOTE_DEFAULTS = Object.freeze({
  text: "",
  depth: 0,
  interval: 1,
  role: "system"
});
var AUTHORS_NOTE_ROLES = Object.freeze([
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" }
]);
var wholeAtLeast = (v, floor, fallback) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(floor, Math.floor(n)) : fallback;
};
function readAuthorsNote(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const role = v.role === "user" || v.role === "assistant" || v.role === "system" ? v.role : AUTHORS_NOTE_DEFAULTS.role;
  return {
    text: typeof v.text === "string" ? v.text : AUTHORS_NOTE_DEFAULTS.text,
    depth: wholeAtLeast(v.depth, 0, AUTHORS_NOTE_DEFAULTS.depth),
    interval: wholeAtLeast(v.interval, 1, AUTHORS_NOTE_DEFAULTS.interval),
    role
  };
}
function authorsNoteDirty(draft, saved) {
  const a = readAuthorsNote(draft);
  const b = readAuthorsNote(saved);
  return a.text !== b.text || a.depth !== b.depth || a.interval !== b.interval || a.role !== b.role;
}
function authorsNoteLastReplyLine(lastReply, t) {
  if (!lastReply)
    return null;
  if (lastReply.included)
    return lastReply.depth === 0 ? t("Last reply: added right before the reply.") : t("Last reply: added {depth} messages before the reply.").replace("{depth}", String(lastReply.depth));
  if (lastReply.reason === "interval")
    return t("Last reply: skipped \u2014 not one of the replies it repeats on.");
  return t("Last reply: nothing added \u2014 the note was empty.");
}

// components/sessions/authors-note/AuthorsNoteWidget.svelte
var root = from_html(`<p data-widget-part="authors-note.alert" role="alert"> </p>`);
var root_1 = from_html(`<p data-widget-part="authors-note.note"> </p>`);
var root_2 = from_html(`<sp-option> </sp-option>`, 2);
var root_3 = from_html(`<span data-widget-part="authors-note.unsaved"> </span> <button type="button" data-widget-part="authors-note.discard"> </button>`, 1);
var root_4 = from_html(`<div data-widget-part="authors-note.actions toolbar"><!> <button type="button" data-widget-part="authors-note.save"> </button></div>`);
var root_5 = from_html(`<p data-widget-part="authors-note.last-reply"> </p>`);
var root_6 = from_html(`<!> <label data-widget-part="authors-note.field"><span data-widget-part="authors-note.label label"> </span> <textarea data-widget-part="authors-note.text" rows="5"></textarea></label> <div data-widget-part="authors-note.numbers"><label data-widget-part="authors-note.field"><span data-widget-part="authors-note.label label"> </span> <input type="number" data-widget-part="authors-note.number" min="0" step="1"/></label> <label data-widget-part="authors-note.field"><span data-widget-part="authors-note.label label"> </span> <input type="number" data-widget-part="authors-note.number" min="1" step="1"/></label></div> <p data-widget-part="authors-note.help"> </p> <sp-accordion><sp-accordion-item><span data-widget-part="authors-note.role"><sp-combobox></sp-combobox></span></sp-accordion-item></sp-accordion> <!> <!> <!>`, 3);
var root_7 = from_html(`<div data-widget-part="authors-note.root" data-widget="authors-note"><!> <!></div>`);
function AuthorsNoteWidget($$anchor, $$props) {
  push($$props, true);
  const widget = useWidgetContext();
  const t = (source) => widget?.current?.t(source) ?? source;
  let answer = state(null);
  let draft = state(proxy({ ...AUTHORS_NOTE_DEFAULTS }));
  let readError = state(null);
  let saveError = state(null);
  let saving = state(false);
  const saved = user_derived(() => get(answer) ? readAuthorsNote(get(answer).note) : AUTHORS_NOTE_DEFAULTS);
  const dirty = user_derived(() => get(answer) ? authorsNoteDirty(get(draft), get(saved)) : false);
  const canEdit = user_derived(() => get(answer)?.canEdit === true);
  const lastLine = user_derived(() => get(answer) ? authorsNoteLastReplyLine(get(answer).lastReply, t) : null);
  const reason = (e) => e instanceof Error ? e.message : String(e);
  function adopt(next) {
    const wasDirty = get(answer) ? authorsNoteDirty(get(draft), readAuthorsNote(get(answer).note)) : false;
    set(answer, next, true);
    if (!wasDirty) set(draft, readAuthorsNote(next.note), true);
  }
  let asked = 0;
  function ask() {
    const ctx = untrack(() => widget?.current);
    if (!ctx) return;
    const ticket = ++asked;
    ctx.request("authors-note", {}).then(
      (res) => {
        if (ticket !== asked) return;
        set(readError, null);
        adopt(res);
      },
      (e) => {
        if (ticket !== asked) return;
        set(readError, reason(e), true);
      }
    );
  }
  user_effect(() => untrack(() => ask()));
  user_effect(() => untrack(() => widget?.current?.on("generation:end", (e) => {
    if (e.kind === "generation:end") ask();
  })));
  user_effect(() => untrack(() => widget?.current?.on("genreFields:changed", (e) => {
    if (e.kind === "genreFields:changed") ask();
  })));
  async function save() {
    const ctx = untrack(() => widget?.current);
    if (!ctx || !get(canEdit) || !get(dirty) || get(saving)) return;
    set(saving, true);
    set(saveError, null);
    const sent = readAuthorsNote(get(draft));
    try {
      const now = await ctx.request("set-authors-note", { note: sent });
      set(answer, now, true);
      set(draft, readAuthorsNote(now.note), true);
    } catch (e) {
      set(saveError, t("Not saved: {reason}").replace("{reason}", reason(e)), true);
    } finally {
      set(saving, false);
    }
  }
  function discard() {
    set(draft, { ...get(saved) }, true);
    set(saveError, null);
  }
  const setNumber = (key, raw) => {
    const n = raw.trim() === "" ? NaN : Number(raw);
    set(
      draft,
      {
        ...get(draft),
        [key]: Number.isFinite(n) ? n : get(draft)[key]
      },
      true
    );
  };
  var div = root_7();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var p = root();
      var text = child(p, true);
      reset(p);
      template_effect(($0) => set_text(text, $0), [
        () => t("Could not read the author's note: {reason}").replace("{reason}", get(readError))
      ]);
      append($$anchor2, p);
    };
    if_block(node, ($$render) => {
      if (get(readError)) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var fragment = comment();
      var node_2 = first_child(fragment);
      {
        var consequent_1 = ($$anchor3) => {
          var p_1 = root_1();
          var text_1 = child(p_1, true);
          reset(p_1);
          template_effect(($0) => set_text(text_1, $0), [() => t("Reading the author's note\u2026")]);
          append($$anchor3, p_1);
        };
        if_block(node_2, ($$render) => {
          if (!get(readError)) $$render(consequent_1);
        });
      }
      append($$anchor2, fragment);
    };
    var consequent_3 = ($$anchor2) => {
      var p_2 = root_1();
      var text_2 = child(p_2, true);
      reset(p_2);
      template_effect(($0) => set_text(text_2, $0), [() => t("This kind of session has no author's note.")]);
      append($$anchor2, p_2);
    };
    var alternate = ($$anchor2) => {
      var fragment_1 = root_6();
      var node_3 = first_child(fragment_1);
      {
        var consequent_4 = ($$anchor3) => {
          var p_3 = root_1();
          var text_3 = child(p_3, true);
          reset(p_3);
          template_effect(($0) => set_text(text_3, $0), [
            () => t("Only the session's owner can change the author's note.")
          ]);
          append($$anchor3, p_3);
        };
        if_block(node_3, ($$render) => {
          if (!get(canEdit)) $$render(consequent_4);
        });
      }
      var label = sibling(node_3, 2);
      var span = child(label);
      var text_4 = child(span, true);
      reset(span);
      var textarea = sibling(span, 2);
      remove_textarea_child(textarea);
      reset(label);
      var div_1 = sibling(label, 2);
      var label_1 = child(div_1);
      var span_1 = child(label_1);
      var text_5 = child(span_1, true);
      reset(span_1);
      var input = sibling(span_1, 2);
      remove_input_defaults(input);
      reset(label_1);
      var label_2 = sibling(label_1, 2);
      var span_2 = child(label_2);
      var text_6 = child(span_2, true);
      reset(span_2);
      var input_1 = sibling(span_2, 2);
      remove_input_defaults(input_1);
      reset(label_2);
      reset(div_1);
      var p_4 = sibling(div_1, 2);
      var text_7 = child(p_4, true);
      reset(p_4);
      var sp_accordion = sibling(p_4, 2);
      set_custom_element_data(sp_accordion, "data-widget-part", "authors-note.advanced");
      var sp_accordion_item = child(sp_accordion);
      set_custom_element_data(sp_accordion_item, "value", "advanced");
      template_effect(($0) => set_custom_element_data(sp_accordion_item, "heading", $0), [() => t("Advanced")]);
      set_custom_element_data(sp_accordion_item, "level", "4");
      var span_3 = child(sp_accordion_item);
      var sp_combobox = child(span_3);
      set_custom_element_data(sp_combobox, "data-widget-part", "authors-note.role-field");
      template_effect(($0) => set_custom_element_data(sp_combobox, "label", $0), [() => t("Sent as")]);
      template_effect(() => set_custom_element_data(sp_combobox, "value", get(draft).role));
      template_effect(() => set_custom_element_data(sp_combobox, "disabled", !get(canEdit)));
      each(sp_combobox, 21, () => AUTHORS_NOTE_ROLES, (r) => r.value, ($$anchor3, r) => {
        var sp_option = root_2();
        template_effect(() => set_custom_element_data(sp_option, "value", get(r).value));
        var text_8 = child(sp_option, true);
        reset(sp_option);
        template_effect(($0) => set_text(text_8, $0), [() => t(get(r).label)]);
        append($$anchor3, sp_option);
      });
      reset(sp_combobox);
      reset(span_3);
      reset(sp_accordion_item);
      reset(sp_accordion);
      var node_4 = sibling(sp_accordion, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var p_5 = root();
          var text_9 = child(p_5, true);
          reset(p_5);
          template_effect(() => set_text(text_9, get(saveError)));
          append($$anchor3, p_5);
        };
        if_block(node_4, ($$render) => {
          if (get(saveError)) $$render(consequent_5);
        });
      }
      var node_5 = sibling(node_4, 2);
      {
        var consequent_7 = ($$anchor3) => {
          var div_2 = root_4();
          var node_6 = child(div_2);
          {
            var consequent_6 = ($$anchor4) => {
              var fragment_2 = root_3();
              var span_4 = first_child(fragment_2);
              var text_10 = child(span_4, true);
              reset(span_4);
              var button = sibling(span_4, 2);
              var text_11 = child(button, true);
              reset(button);
              template_effect(
                ($0, $1) => {
                  set_text(text_10, $0);
                  button.disabled = get(saving);
                  set_text(text_11, $1);
                },
                [() => t("Unsaved changes"), () => t("Discard")]
              );
              delegated("click", button, discard);
              append($$anchor4, fragment_2);
            };
            if_block(node_6, ($$render) => {
              if (get(dirty)) $$render(consequent_6);
            });
          }
          var button_1 = sibling(node_6, 2);
          var text_12 = child(button_1, true);
          reset(button_1);
          reset(div_2);
          template_effect(
            ($0) => {
              button_1.disabled = !get(dirty) || get(saving);
              set_text(text_12, $0);
            },
            [() => get(saving) ? t("Saving\u2026") : t("Save")]
          );
          delegated("click", button_1, save);
          append($$anchor3, div_2);
        };
        if_block(node_5, ($$render) => {
          if (get(canEdit)) $$render(consequent_7);
        });
      }
      var node_7 = sibling(node_5, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var p_6 = root_5();
          var text_13 = child(p_6, true);
          reset(p_6);
          template_effect(() => {
            set_attribute(p_6, "data-applied", get(answer).lastReply?.included ? "" : void 0);
            set_text(text_13, get(lastLine));
          });
          append($$anchor3, p_6);
        };
        if_block(node_7, ($$render) => {
          if (get(lastLine)) $$render(consequent_8);
        });
      }
      template_effect(
        ($0, $1, $2, $3, $4, $5, $6) => {
          set_text(text_4, $0);
          set_attribute(textarea, "placeholder", $1);
          textarea.disabled = !get(canEdit);
          set_value(textarea, get(draft).text);
          set_text(text_5, $2);
          input.disabled = !get(canEdit);
          set_value(input, $3);
          set_text(text_6, $4);
          input_1.disabled = !get(canEdit);
          set_value(input_1, $5);
          set_text(text_7, $6);
        },
        [
          () => t("Note"),
          () => t("What is true now, or where the story should go."),
          () => t("Messages from the end"),
          () => String(get(draft).depth),
          () => t("Every how many replies"),
          () => String(get(draft).interval),
          () => t("0 messages puts it right before the reply. Every 1 reply adds it each time.")
        ]
      );
      delegated("input", textarea, (e) => set(draft, { ...get(draft), text: e.currentTarget.value }, true));
      delegated("input", input, (e) => setNumber("depth", e.currentTarget.value));
      delegated("input", input_1, (e) => setNumber("interval", e.currentTarget.value));
      delegated("change", sp_combobox, (e) => {
        const next = AUTHORS_NOTE_ROLES.find((r) => r.value === e.detail.value);
        if (next) set(draft, { ...get(draft), role: next.value }, true);
      });
      append($$anchor2, fragment_1);
    };
    if_block(node_1, ($$render) => {
      if (!get(answer)) $$render(consequent_2);
      else if (!get(answer).offered) $$render(consequent_3, 1);
      else $$render(alternate, -1);
    });
  }
  reset(div);
  template_effect(() => set_attribute(div, "data-dirty", get(dirty) ? "" : void 0));
  append($$anchor, div);
  pop();
}
delegate(["input", "change", "click"]);

// components/sessions/authors-note/AuthorsNote.svelte
function AuthorsNote($$anchor, $$props) {
  push($$props, true);
  setContext(WIDGET_CONTEXT_KEY, widgetRefFromComponent(untrack(() => $$props.ctx), {
    id: "authors-note",
    instanceId: "authors-note",
    title: "Author's note"
  }));
  AuthorsNoteWidget($$anchor, {});
  pop();
}

// components/sessions/authors-note/authors-note.ts
var authors_note_default = svelteComponent(AuthorsNote);
export {
  authors_note_default as default
};
