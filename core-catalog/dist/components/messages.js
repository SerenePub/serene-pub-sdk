import {
  refuseUnlessIdentical
} from "./shared-RJDGOAVC.js";
import {
  CORE_ACTION_SPEC_ID,
  WIDGET_CONTEXT_KEY,
  actionIdentity,
  append,
  attach,
  autofocus,
  child,
  comment,
  delegate,
  delegated,
  dev_fallback_default,
  each,
  event,
  first_child,
  foldedSectionsOf,
  from_html,
  get,
  getContext,
  i18nFindings,
  i18nText,
  if_block,
  increment,
  index,
  label,
  localeMapOf,
  next,
  noop,
  pop,
  prop,
  props_id,
  proxy,
  push,
  remove_input_defaults,
  replay_events,
  reset,
  scopeNotGranted,
  set,
  setContext,
  set_attribute,
  set_checked,
  set_custom_element_data,
  set_style,
  set_text,
  set_value,
  sibling,
  snippet,
  source,
  state,
  svelteComponent,
  tag,
  template_effect,
  text,
  to_array,
  untrack,
  update,
  update_version,
  useWidgetContext,
  user_derived,
  user_effect,
  widgetRefFromComponent
} from "./shared-UAQVMZZK.js";

// ../sdk/dist/predicates.js
var truthy = (v) => !!v && !(Array.isArray(v) && v.length === 0);
function readPath(value, path) {
  if (!path)
    return value;
  let cur = value;
  for (const seg of path.split(".")) {
    if (cur == null)
      return void 0;
    cur = cur[seg];
  }
  return cur;
}
var PREDICATE_CONDITION_KEYS = ["equals", "equalsPath", "truthy"];
function predicateHolds(pred, value, scope) {
  if (pred.equals !== void 0)
    return value === pred.equals;
  if (pred.equalsPath !== void 0) {
    if (typeof pred.equalsPath !== "string" || !pred.equalsPath)
      return false;
    if (value === void 0)
      return false;
    const other = readPath(scope, pred.equalsPath);
    return other !== void 0 && value === other;
  }
  if (pred.truthy)
    return truthy(value);
  return false;
}
var ENABLED_WHEN_KEYS = [
  "on",
  ...PREDICATE_CONDITION_KEYS,
  "reason"
];
var isEnabledWhenShaped = (p) => !!p && typeof p === "object" && !Array.isArray(p) && typeof p.on === "string";
function normalizeEnabledWhen(x) {
  if (x == null)
    return [];
  const list = Array.isArray(x) ? x : [x];
  return list.filter(isEnabledWhenShaped).map((p) => ({
    ...p,
    reason: p.reason === void 0 ? p.reason : localeMapOf(p.reason)
  }));
}
function evaluateEnabledWhen(preds, doc) {
  for (const pred of normalizeEnabledWhen(preds)) {
    if (predicateHolds(pred, readPath(doc, pred.on), doc))
      continue;
    return { enabled: false, reason: localeMapOf(pred.reason), failed: pred };
  }
  return { enabled: true };
}

// ../sdk/dist/participants.js
var PARTICIPANT_ROLES = ["owner", "admin", "participant", "person", "ai", "item", "run-owner"];
function audienceHolds(refs, portrayals, viewer, item) {
  for (const ref of refs) {
    if (ref === "item") {
      if (item === void 0 || item)
        return true;
      continue;
    }
    const p = portrayals[ref];
    if (p?.by === "person" && p.userId === String(viewer.userId))
      return true;
  }
  return false;
}
var ID = /^[^\s:]+$/;
var SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
var roles = new Set(PARTICIPANT_ROLES);
function parseParticipantRef(raw) {
  if (typeof raw !== "string")
    throw new Error(`a participant reference is a string \u2014 got ${raw === null ? "null" : typeof raw}`);
  const text3 = raw.trim();
  if (roles.has(text3))
    return { kind: text3 };
  const cut = text3.indexOf(":");
  if (cut === -1)
    throw new Error(`'${raw}' is not a participant reference \u2014 expected one of ${PARTICIPANT_ROLES.join(", ")}, or user:<id>, character:<id>, envoy:<slug>`);
  const kind = text3.slice(0, cut);
  const rest = text3.slice(cut + 1);
  switch (kind) {
    case "user":
    case "character":
      if (!ID.test(rest))
        throw new Error(`'${raw}' names a ${kind} with no readable id \u2014 a ${kind} reference is '${kind}:<id>'`);
      return { kind, id: rest };
    case "envoy":
      if (!SLUG.test(rest))
        throw new Error(`'${raw}' names an envoy with no readable slug \u2014 an envoy reference is 'envoy:<slug>', the slug a letter or digit followed by letters, digits, '.', '_' or '-'`);
      return { kind, slug: rest };
    default:
      throw new Error(`'${raw}' is not a participant reference \u2014 '${kind}:' is not a kind (user, character, envoy)`);
  }
}
function envoySlugOfRef(ref) {
  if (typeof ref !== "string")
    return null;
  try {
    const parsed = parseParticipantRef(ref);
    return parsed.kind === "envoy" ? parsed.slug : null;
  } catch {
    return null;
  }
}

// ../sdk/dist/settingsSlot.js
var SETTINGS_SLOT = "settings";
var ENABLED_FIELD = Object.freeze({
  type: "boolean",
  default: true,
  quick: true,
  label: { en: "Use this source" },
  description: {
    en: "Off skips the step entirely rather than fetching and discarding it \u2014 cheaper than starving it with a zero share."
  }
});
var ENABLED_STEP_FIELD = Object.freeze({
  type: "boolean",
  default: true,
  quick: true,
  label: { en: "Run this step" },
  description: {
    en: "Off skips the step entirely: nothing is called or charged, and the steps after it go on without what it would have made."
  }
});

// ../sdk/dist/verdicts.js
var DOORS = [
  "construction",
  "registry",
  "validate",
  "publish",
  "run",
  "fire",
  "write",
  "list"
];
var VERDICT_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:verdict\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
var registry = /* @__PURE__ */ new Map();
var doorSet = new Set(DOORS);
function defineVerdict(decl) {
  if (typeof decl.id !== "string" || !VERDICT_ID.test(decl.id))
    throw new Error(`'${String(decl.id)}' is not a verdict id \u2014 one is '<owner>:verdict/<slug>', the slug lowercase letters, digits and hyphens: core:verdict/effects-line`);
  if (typeof decl.law !== "string" || !decl.law.trim())
    throw new Error(`${decl.id} names no law \u2014 'law' is the label a Finding carries for this rule ('F39', 'R-20')`);
  if (!Array.isArray(decl.doors) || decl.doors.length === 0)
    throw new Error(`${decl.id} declares no door \u2014 list every place the rule is heard, one of ${DOORS.join(", ")}`);
  const unknown = decl.doors.find((d) => !doorSet.has(d));
  if (unknown !== void 0)
    throw new Error(`${decl.id} declares the door '${String(unknown)}', which is not one \u2014 a door is one of ${DOORS.join(", ")}`);
  if (typeof decl.judge !== "function" || typeof decl.failing !== "function")
    throw new Error(`${decl.id} declares no judge or no failing input \u2014 a verdict is { id, law, doors, judge, failing }`);
  const existing = registry.get(decl.id);
  if (existing)
    refuseUnlessIdentical(existing, decl, `duplicate verdict id: ${decl.id}`);
  const verdict = Object.freeze({ ...decl, doors: Object.freeze([...decl.doors]) });
  registry.set(decl.id, verdict);
  return verdict;
}
var i18nVerdict = defineVerdict({
  id: "core:verdict/i18n",
  law: "R-20",
  doors: ["construction", "registry", "validate", "publish", "run"],
  judge({ value, where, required }) {
    const [sentence] = i18nFindings(value, where, { required });
    return sentence === void 0 ? { ok: true } : { ok: false, sentence };
  },
  // The field each door is asked about — the sentence names it, so the
  // door's own address has to be the one the kit expects to hear back: a
  // definition's name at the registry, a preset's label where a document
  // is built, validated or published, a status's text at the run.
  failing: (door) => ({
    value: { fr: "Titre" },
    where: door === "registry" ? "i18n.name" : door === "run" ? "status.i18n" : "presets[lore].label",
    required: true
  })
});
var enablementVerdict = defineVerdict({
  id: "core:verdict/enablement",
  law: "U5e",
  doors: ["list", "fire"],
  judge({ preds, doc }) {
    const heard = evaluateEnabledWhen(preds, doc);
    return heard.enabled ? { ok: true } : { ok: false, sentence: heard.reason };
  },
  failing: () => ({
    preds: [
      {
        on: "state.world.conformance",
        truthy: true,
        reason: { en: "conformance: the enabled-when predicate refused this press" }
      }
    ],
    doc: { state: { world: { conformance: false } } }
  })
});
var audienceVerdict = defineVerdict({
  id: "core:verdict/audience",
  law: "R-15",
  doors: ["list", "fire"],
  judge({ name, refs, portrayals, viewer, item }) {
    if (audienceHolds(refs, portrayals, viewer, item))
      return { ok: true };
    return {
      ok: false,
      sentence: `'${name}' is not yours to use here \u2014 its audience is ${refs.length ? refs.join(", ") : "nobody"}.`
    };
  },
  failing: () => ({
    name: "grant",
    refs: ["owner"],
    portrayals: { owner: { by: "person", userId: "1" } },
    viewer: { userId: 2 }
  })
});
var isSettingsAddress = (name) => typeof name === "string" && (name === SETTINGS_SLOT || name.startsWith(`${SETTINGS_SLOT}.`));
var settingsTravelVerdict = defineVerdict({
  id: "core:verdict/settings-travel",
  law: "F39",
  doors: ["registry", "validate", "run"],
  judge(input) {
    switch (input.kind) {
      case "edge": {
        if (!isSettingsAddress(input.fromPort))
          return { ok: true };
        const { from, fromPort, to, toPort } = input;
        return {
          ok: false,
          sentence: `'${to}.${toPort}' reads '${from}.${fromPort}' \u2014 a setting, not a port; settings never travel, only data does`,
          fix: `wire a port '${from}' publishes (what it DID with the setting), or declare the value '${to}' needs on its own params and share the owner's with slot.params({ node: '${from}' }) \u2014 the substrate's switches (enabled, review, mode) are read at their owner by the executor and are never a value`
        };
      }
      case "reference": {
        if (!isSettingsAddress(input.slot))
          return { ok: true };
        const { node, key, target } = input;
        return {
          ok: false,
          sentence: `'${node}.${key}' references '${target}.${SETTINGS_SLOT}' \u2014 the substrate's switches, read at their owner by the executor and never a value; settings never travel, only data does`,
          fix: `read a port '${target}' publishes, or declare the value '${node}' needs on its own params and share the owner's with slot.params({ node: '${target}' }) \u2014 a switch (enabled, review, mode) belongs to no reference`
        };
      }
      case "port": {
        if (!isSettingsAddress(input.port))
          return { ok: true };
        const { definitionId, port } = input;
        return {
          ok: false,
          sentence: `${definitionId} declares an out-port named '${port}'. '<node>.${SETTINGS_SLOT}' (and paths under it) is the address of the substrate's own switches \u2014 \`enabled\`, \`review\`, \`mode\` \u2014 which the executor reads at the node and hands to nobody (F39: settings never travel), so an edge from a port of that name would be refused as a setting`,
          fix: `name the port for what it publishes ('result', 'applied', 'chosen')`
        };
      }
      default:
        return {
          ok: false,
          sentence: `'${String(input.kind)}' is not a shape this verdict judges \u2014 one of 'edge', 'reference', 'port'.`
        };
    }
  },
  failing: (door) => door === "registry" ? { kind: "port", definitionId: "conformance:task/claims-settings-port@1", port: "settings.review" } : door === "run" ? { kind: "reference", node: "probe", key: "main", slot: SETTINGS_SLOT, target: "save" } : { kind: "edge", from: "save", fromPort: `${SETTINGS_SLOT}.review`, to: "probe", toPort: "main" }
});
var provisionalVerdict = defineVerdict({
  id: "core:verdict/provisional",
  law: "R-2",
  doors: ["validate", "run", "registry"],
  judge(input) {
    switch (input.kind) {
      case "placement": {
        if (!input.provisional)
          return { ok: true };
        const { nodeKey, definitionId, definitionVersion } = input;
        return {
          ok: false,
          sentence: `'${nodeKey}' places ${definitionId}@${definitionVersion}, which is provisional \u2014 declared, not bound: no handler runs it in this release (R-2)`,
          fix: "bind it or remove the node"
        };
      }
      case "publication": {
        if (input.provisional || input.bound)
          return { ok: true };
        return {
          ok: false,
          sentence: `${input.definitionId} is published with no handler behind it and no plan claiming it \u2014 declared, not bound (R-2)`,
          fix: "bind it in bindings.ts, mark it `provisional: true` under the plan that owns it, or cull it"
        };
      }
      default:
        return {
          ok: false,
          sentence: `'${String(input.kind)}' is not a shape this verdict judges \u2014 one of 'placement', 'publication'.`
        };
    }
  },
  failing: (door) => door === "registry" ? { kind: "publication", definitionId: "core:task/stray-unbound@1", provisional: false, bound: false } : {
    kind: "placement",
    nodeKey: "pending",
    definitionId: "conformance:oracle/pending",
    definitionVersion: 1,
    provisional: true
  }
});

// ../sdk/dist/genres.js
var sessionEvents = Object.freeze({
  /** The create slot — required; exactly one pipeline per genre declares it. */
  sessionCreated: "core:event/session-created@1",
  /** The primary turn. A swipe is this pipeline re-run, not a new event. */
  messageRespond: "core:event/message-respond@1",
  /** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
  sessionAction: "core:event/session-action@1",
  /** A character or persona joined; payload carries the kind. */
  memberAdded: "core:event/member-added@1",
  /** A character or persona left; payload carries the kind. */
  memberRemoved: "core:event/member-removed@1",
  /**
   * A form in a message was addressed to a participant the AI portrays
   * (R-15 *Forms*; U5d). Optional in every genre's surface: a genre that
   * binds nothing leaves such a form waiting, as it would for a person.
   */
  formAddressed: "core:event/form-addressed@1",
  // ── Turn order as event-driven state (PLAN-turn-order §4.1, 2026-09-21) ──
  // The events a genre may bind its turn-order spec to. A genre that
  // binds the spec lists every event it binds it to, all optional (`{}`).
  /** A row that is not generating landed — a send, a greeting, a finished or stopped reply. */
  messageCompleted: "core:event/message-completed@1",
  /** A person rewrote a settled message. */
  messageEdited: "core:event/message-edited@1",
  /** A message was deleted. */
  messageDeleted: "core:event/message-deleted@1",
  /** A message was hidden from the prompt, or shown again. */
  messageHidden: "core:event/message-hidden@1",
  /** A line's shown sprite changed — a picker's choice or a person's (DESIGN-sprites). */
  spriteShown: "core:event/sprite-shown@1",
  /** A seated participant's row changed — active, position, visibility or portrayal. */
  castChanged: "core:event/cast-changed@1",
  /** `sessions:update` landed — name, scenario, lorebook, genre fields, preset, channels, tags. */
  sessionUpdated: "core:event/session-updated@1",
  /** A session was branched at a message into a new session; recorded on the branch. */
  sessionBranched: "core:event/session-branched@1",
  /**
   * A pipeline's annex entry changed — "my state changed". Caused by
   * `core:outlet/set-session-annex@1`; the payload names the owner.
   */
  annexChanged: "core:event/annex-changed@1",
  /**
   * `metadata.turnOrder` was written. **For typing only**: core-internal,
   * read by the auto-advance listener and the `sessions:turnOrder` push;
   * `genre()` refuses it in `events`, so no preset can bind it.
   */
  turnOrderChanged: "core:event/turn-order-changed@1"
});
var TURN_ORDER_CHANGED_IS_INTERNAL = `'${sessionEvents.turnOrderChanged}' is core-internal \u2014 the auto-advance listener and the turn-order push read it, and a pipeline bound to it would recompute the order it was told about. Bind '${sessionEvents.messageCompleted}' and the other session events instead.`;
var UNCLAIMED_LINE_NAME = Object.freeze({ en: "Narrator" });

// ../sdk/dist/actions.js
var WORLD_ACTION_VENUES = ["composer", "message", "session-settings", "admin", "review"];
var WORLD_ACTION_ACTORS = ["owner", "admin"];
var effectsOf = (action) => action.effects === "world" ? "world" : "fiction";
var VENUE_KINDS = [
  "composer",
  "message",
  "extra",
  "widget",
  "session-settings",
  "pipelines",
  "admin",
  "review",
  "form"
];
var LISTED_VENUE_KINDS = VENUE_KINDS.filter((k) => k !== "form");
var DEFAULT_ACTION_AUDIENCE = Object.freeze({
  see: ["participant"],
  act: ["owner"]
});
var ITEM_AUDIENCE = Object.freeze({
  see: ["participant"],
  act: ["item"]
});
var EFFECTS_LINE_FIX = `move the action to a venue on the owner's side of the line (${WORLD_ACTION_VENUES.join(", ")}) and keep audience.act to ${WORLD_ACTION_ACTORS.join(" and/or ")} \u2014 or declare effects: 'fiction' if its result stays inside the story`;
function worldActionCrossing(input) {
  if (input.effects !== "world")
    return { ok: true };
  if (input.kind === "venue") {
    const kind = input.venue;
    if (typeof kind !== "string" || WORLD_ACTION_VENUES.includes(kind))
      return { ok: true };
    return {
      ok: false,
      sentence: `${input.where}: a 'world' action may not appear in the '${kind}' venue \u2014 its result reaches outside the fiction (cards, lore, settings, permissions), so it belongs in ${WORLD_ACTION_VENUES.join(", ")} and never where a character could be asked to answer it (the effects line, R-15)`,
      fix: EFFECTS_LINE_FIX
    };
  }
  if (WORLD_ACTION_ACTORS.includes(String(input.ref)))
    return { ok: true };
  return {
    ok: false,
    sentence: `${input.where}: a 'world' action's audience.act names '${String(input.ref)}' \u2014 an out-of-fiction effect is the owner's (or an administrator's) to invoke, never a participant's or a character's (the effects line, R-15)`,
    fix: EFFECTS_LINE_FIX
  };
}
function normalizeAction(raw) {
  const a = { ...raw };
  if (a.venue && !Array.isArray(a.venue))
    a.venue = [a.venue];
  else if (!Array.isArray(a.venue))
    a.venue = [];
  if (a.envoy && typeof a.envoy === "object")
    a.envoy = { ...a.envoy, speaks: "on-action" };
  if (a.enabledWhen !== void 0 && a.enabledWhen !== null) {
    const list = Array.isArray(a.enabledWhen) ? a.enabledWhen : [a.enabledWhen];
    if (list.every(isEnabledWhenShaped))
      a.enabledWhen = normalizeEnabledWhen(a.enabledWhen);
  }
  if (a.presentWhen !== void 0 && a.presentWhen !== null) {
    const list = Array.isArray(a.presentWhen) ? a.presentWhen : [a.presentWhen];
    if (list.every(isEnabledWhenShaped))
      a.presentWhen = normalizeEnabledWhen(a.presentWhen);
  }
  return a;
}
function normalizeContributes(contributes) {
  if (!contributes)
    return contributes;
  const { actions, ...rest } = contributes;
  if (!actions?.length)
    return rest;
  return { ...rest, actions: actions.map(normalizeAction) };
}
function actionsOf(doc) {
  const c = doc.contributes;
  const normalized = normalizeContributes(c);
  return (normalized?.actions ?? []).map((a) => ({ ...a, specId: doc.id }));
}
var CORE_VERB_REASONS = Object.freeze({
  generating: { en: "wait for the reply to finish" },
  hidden: { en: "unhide it first" },
  notNewest: { en: "only the newest reply can be regenerated" },
  noSwipe: { en: "nothing to swipe to" },
  greeting: { en: "a greeting is swiped, not regenerated" },
  ownLine: { en: "your own line is edited, not regenerated" },
  nobodySeated: { en: "nobody is seated to pick" }
});
var NOT_GENERATING = {
  on: "session.generating",
  equals: false,
  reason: CORE_VERB_REASONS.generating
};
var NEWEST = { on: "item.isNewest", truthy: true, reason: CORE_VERB_REASONS.notNewest };
var REPLY = { on: "item.role", equals: "assistant", reason: CORE_VERB_REASONS.ownLine };
var CORE_ACTIONS = Object.freeze([
  {
    key: "stop",
    venue: [{ kind: "message" }],
    audience: { see: ["participant"], act: ["participant"] },
    quick: true,
    label: { en: "Stop generating" },
    description: { en: "Stop the reply being written now; what it wrote so far is kept." },
    icon: "square",
    floor: true
  },
  {
    key: "edit",
    venue: [{ kind: "message" }],
    audience: ITEM_AUDIENCE,
    quick: true,
    label: { en: "Edit" },
    description: { en: "Change the text of this message." },
    icon: "pencil",
    enabledWhen: [
      { on: "item.hidden", equals: false, reason: CORE_VERB_REASONS.hidden },
      NOT_GENERATING
    ],
    floor: true
  },
  {
    key: "branch",
    venue: [{ kind: "message" }],
    audience: { see: ["participant"], act: ["owner"] },
    label: { en: "Branch from here" },
    description: { en: "Start a copy of the session from this message, leaving this one as it is." },
    icon: "git-branch",
    enabledWhen: [NOT_GENERATING],
    floor: true
  },
  {
    key: "retry",
    venue: [{ kind: "message" }, { kind: "extra" }],
    audience: ITEM_AUDIENCE,
    quick: true,
    slash: "retry",
    label: { en: "Regenerate" },
    description: { en: "Write the newest reply again, in place of the one there." },
    icon: "refresh-cw",
    enabledWhen: [
      NEWEST,
      REPLY,
      { on: "item.greeting", equals: false, reason: CORE_VERB_REASONS.greeting },
      { on: "item.hidden", equals: false, reason: CORE_VERB_REASONS.hidden },
      NOT_GENERATING
    ],
    floor: false
  },
  {
    // The prefill extend: carry this reply on (ruling 2026-09-08; renamed
    // from `continue` 2026-09-28). A message verb only — the composer's
    // Continue is `advance` below.
    key: "extend",
    venue: [{ kind: "message" }],
    audience: ITEM_AUDIENCE,
    label: { en: "Extend" },
    description: { en: "Carry on writing this reply from where it stopped." },
    icon: "arrow-down",
    enabledWhen: [NEWEST, REPLY, NOT_GENERATING],
    floor: false
  },
  {
    // The composer's Continue (lair pass B7): fire the turn order's head.
    // A turn control, not a message verb — no row, so no `item.*`
    // predicate; who may fire which entry is the fire's own rule.
    key: "advance",
    venue: [{ kind: "extra" }],
    audience: { see: ["participant"], act: ["participant"] },
    slash: "advance",
    label: { en: "Continue" },
    description: { en: "Let whoever is next in the turn order speak." },
    icon: "message-square-more",
    enabledWhen: [NOT_GENERATING],
    floor: false
  },
  {
    // Pick who speaks (lair pass B8): fire a character the person names.
    // A turn control — present where the genre's `turnControls.pick`
    // says it applies; greyed here while busy or with nobody to pick.
    key: "pick",
    venue: [{ kind: "extra" }],
    audience: { see: ["participant"], act: ["participant"] },
    // Not `/pick`: too plain a word to take from every plugin's palette.
    slash: "pick-speaker",
    label: { en: "Pick who speaks" },
    description: { en: "Choose which character speaks next." },
    icon: "message-square-plus",
    enabledWhen: [
      NOT_GENERATING,
      { on: "state.who.active", truthy: true, reason: CORE_VERB_REASONS.nobodySeated }
    ],
    floor: false
  },
  {
    // The genre's own voice narrates (lair pass B8, D3; R8): fire it with
    // no new direction — Adventure's narrator, the Lair's Castellan (the
    // host stamps the fire `via: 'narrate'`). Opt-in — only a `voice:
    // 'narrator'` genre has one (`turnControls.narrate`). The owner's, as
    // a pick out of order is.
    key: "narrate",
    venue: [{ kind: "extra" }],
    audience: { see: ["participant"], act: ["owner"] },
    // Not `/narrate`: Chat's narrate spec claims that name, and one
    // slash name means one action (`slashCollisions`).
    slash: "narrator",
    label: { en: "Narrate" },
    // Voice-neutral (lair pass R8, 2026-09-28): whose voice narrates is
    // the genre's — Adventure's narrator, the Lair's Castellan.
    description: { en: "Describe what happens next, with no new direction." },
    icon: "cloud-sun",
    enabledWhen: [NOT_GENERATING],
    floor: false
  },
  {
    // Regenerate the last turn, as a whole (lair pass R2, owner
    // 2026-09-28): delete the newest turn's yield — every row its run
    // created, on every channel, never a person's own line — and take
    // the same turn again. Opt-in (`turnControls.retake`), for a genre
    // whose turn writes more than one row; where it is offered, `retry`
    // leaves the extra venue so one genre never shows two _Regenerate_
    // chips. The owner's: it deletes what everybody at the table saw.
    key: "retake",
    venue: [{ kind: "extra" }],
    audience: { see: ["participant"], act: ["owner"] },
    slash: "retake",
    label: { en: "Regenerate" },
    description: {
      en: "Delete the last turn's messages and take the same turn again. Your own lines stay."
    },
    icon: "refresh-cw",
    enabledWhen: [NOT_GENERATING],
    floor: false
  },
  {
    key: "swipe",
    venue: [{ kind: "message" }],
    audience: ITEM_AUDIENCE,
    label: { en: "Swipe" },
    description: { en: "Step between the other versions of this reply." },
    icon: "chevrons-left-right",
    enabledWhen: [
      NEWEST,
      REPLY,
      { on: "item.hasSwipes", truthy: true, reason: CORE_VERB_REASONS.noSwipe },
      NOT_GENERATING
    ],
    floor: false
  },
  {
    key: "hide",
    venue: [{ kind: "message" }],
    audience: ITEM_AUDIENCE,
    label: { en: "Hide" },
    description: { en: "Leave this message out of what the characters remember; it stays on the page." },
    icon: "ghost",
    enabledWhen: [NOT_GENERATING],
    floor: false
  },
  {
    key: "delete",
    venue: [{ kind: "message" }],
    audience: ITEM_AUDIENCE,
    label: { en: "Delete" },
    description: { en: "Remove this message from the session." },
    icon: "trash-2",
    enabledWhen: [NOT_GENERATING],
    floor: false
  }
]);

// ../sdk/dist/status.js
var VAR_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
function renderStatusText(text3, language = "en") {
  const template = i18nText(text3.i18n, language) ?? "";
  const vars = text3.vars ?? {};
  const withoutUnfilledSpeaker = !("speaker" in vars) && template.startsWith("{speaker} ") ? template.slice("{speaker} ".length) : template;
  return withoutUnfilledSpeaker.replace(VAR_PATTERN, (whole, name) => name in vars ? String(vars[name]) : whole);
}

// ../sdk/dist/messageBlocks.js
var MESSAGE_BLOCK_LIMITS = {
  maxBlocks: 64,
  maxDepth: 3,
  maxText: 64 * 1024,
  maxRows: 64,
  maxActions: 12
};
function formBlocksOf(blocks) {
  const out = [];
  const walk = (list) => {
    for (const b of list) {
      if (b.kind === "choices" || b.kind === "form")
        out.push(b);
      else if (b.kind === "group")
        walk(b.blocks);
    }
  };
  walk(blocks);
  return out;
}
var isOwnerAddressed = (addressee) => addressee === "owner";
function worldBlockFunctions(blocks, spec) {
  const world = new Set(actionsOf(spec).filter((a) => effectsOf(a) === "world").map((a) => a.key));
  const fns = /* @__PURE__ */ new Set();
  for (const b of formBlocksOf(blocks)) {
    if (isOwnerAddressed(b.addressee))
      continue;
    if (b.kind === "choices") {
      for (const a of b.actions)
        if (world.has(a.fn))
          fns.add(a.fn);
    } else if (world.has(b.fn))
      fns.add(b.fn);
  }
  return [...fns];
}
var worldBlockSentence = (named) => `the blocks name ${named}, whose action changes something outside the story (effects: 'world'). Such an action is the owner's, from the composer or the review gate \u2014 the one block that may carry it is one addressed to 'owner' (the effects line, R-15)`;
var effectsLineVerdict = defineVerdict({
  id: "core:verdict/effects-line",
  law: "F41",
  doors: ["construction", "validate", "publish", "write", "fire"],
  judge(input) {
    switch (input.kind) {
      case "venue":
      case "actor":
        return worldActionCrossing(input);
      case "block": {
        const world = worldBlockFunctions(input.blocks, input.spec);
        if (!world.length)
          return { ok: true };
        return { ok: false, sentence: worldBlockSentence(world.map((f) => `'${f}'`).join(", ")) };
      }
      case "identity": {
        const ownersOnly = input.addressees.length > 0 && input.addressees.every(isOwnerAddressed);
        if (input.effects !== "world" || ownersOnly)
          return { ok: true };
        return { ok: false, sentence: worldBlockSentence(`'${input.identity}'`) };
      }
      case "press": {
        if (input.effects !== "world")
          return { ok: true };
        if (!input.as && !(input.onBlock && !isOwnerAddressed(input.blockAddressee)))
          return { ok: true };
        return {
          ok: false,
          sentence: `'${input.name}' changes something outside the story, so it is the owner's to invoke from the composer, or from a question put to them \u2014 never a question put to anybody else.`
        };
      }
      default:
        return {
          ok: false,
          sentence: `'${String(input.kind)}' is not a shape this verdict judges \u2014 one of 'venue', 'actor', 'block', 'identity', 'press'.`
        };
    }
  },
  failing: (door) => door === "write" ? {
    kind: "block",
    blocks: [
      {
        kind: "choices",
        question: "Give them the keys?",
        actions: [{ fn: "grant", label: "Yes", choice: "yes" }]
      }
    ],
    spec: {
      id: "conformance:spec/world-in-composer",
      contributes: {
        actions: [
          {
            key: "grant",
            genre: "core:genre/chat",
            venue: { kind: "composer" },
            label: { en: "Grant" },
            description: { en: "Grant a permission outside the story." },
            effects: "world"
          }
        ]
      }
    }
  } : door === "fire" ? { kind: "press", name: "Grant", effects: "world", as: true, onBlock: false, blockAddressee: void 0 } : { kind: "venue", where: "contributes.actions[grant]", effects: "world", venue: "widget" }
});
var isChannelHead = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
function isFormStale(block, headNow) {
  if (block.answered)
    return false;
  if (!isChannelHead(block.head))
    return false;
  if (headNow == null)
    return false;
  return headNow > block.head;
}
var stalenessVerdict = defineVerdict({
  id: "core:verdict/staleness",
  law: "U5f",
  doors: ["fire", "list"],
  judge({ block, headNow }) {
    if (!isFormStale(block, headNow))
      return { ok: true };
    return {
      ok: false,
      sentence: "That question was overtaken \u2014 the conversation moved on before it was answered."
    };
  },
  failing: () => ({ block: { head: 3 }, headNow: 4 })
});

// dist/ui/sessions/conversation/dossier.js
var NO_LINE = {
  controllable: false,
  speaker: { name: UNCLAIMED_LINE_NAME.en, ref: null, face: null, sprite: null },
  swipes: { show: false, right: false },
  embedding: "hidden"
};

// dist/ui/sessions/conversation/formAnswer.js
var rowId = (text3) => {
  if (!/^\d{1,10}$/.test(text3))
    return null;
  const n = Number(text3);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
function canAnswerForm(addressee, viewer, session) {
  if (!addressee)
    return true;
  if (viewer.userId == null)
    return false;
  const cut = addressee.indexOf(":");
  const kind = cut === -1 ? addressee : addressee.slice(0, cut);
  const rest = cut === -1 ? "" : addressee.slice(cut + 1);
  switch (kind) {
    case "character": {
      const id = rowId(rest);
      if (id === null)
        return viewer.isOwner;
      const presence = (session?.sessionPersonas ?? []).find((p) => p?.personaId === id);
      if (presence)
        return presence.persona?.userId === viewer.userId;
      const seated = (session?.sessionCharacters ?? []).some((c) => c?.characterId === id);
      return seated ? false : viewer.isOwner;
    }
    case "envoy":
      return false;
    case "user":
      return rowId(rest) === viewer.userId;
    case "owner":
      return viewer.isOwner;
    case "admin":
      return viewer.isAdmin === true;
    case "participant":
    case "run-owner":
      return true;
    default:
      return false;
  }
}
function answeredChoiceLabel(block, answered) {
  if (block.kind !== "choices" || answered.choice === void 0)
    return null;
  const option = (block.actions ?? []).find((o) => o.choice === answered.choice);
  return option?.label ?? answered.choice;
}
function channelHeadOf(messages, channel) {
  let head = null;
  for (const m of messages) {
    if (!m || (m.channel ?? "main") !== channel)
      continue;
    if (head === null || m.id > head)
      head = m.id;
  }
  return head;
}
function stalenessHeadOf(messages, channel, rowId2) {
  return channelHeadOf(messages.filter((m) => m?.metadata?.answersForm?.messageId !== rowId2), channel);
}
function staleOf(block, row, messages) {
  const headNow = stalenessHeadOf(messages, row.channel ?? "main", row.id);
  return !stalenessVerdict.judge({ block, headNow }).ok;
}
function answeredOf(block) {
  const a = block?.answered;
  if (!a || typeof a !== "object" || typeof a.by !== "string" || typeof a.at !== "string")
    return null;
  return {
    by: a.by,
    at: a.at,
    ...typeof a.choice === "string" ? { choice: a.choice } : {}
  };
}

// dist/ui/sessions/conversation/itemValues.js
function itemSpeakerOf(row) {
  const envoy = envoySlugOfRef(row.metadata?.speaker);
  if (envoy)
    return `envoy:${envoy}`;
  if (row.personaId != null)
    return `character:${row.personaId}`;
  if (row.characterId != null)
    return `character:${row.characterId}`;
  return null;
}
function itemValuesOf(row, facts) {
  const greeting = row.metadata?.isGreeting === true;
  const swipes = row.metadata?.swipes;
  const idx = swipes?.currentIdx;
  const len = swipes?.history?.length ?? 0;
  const hasNext = typeof idx === "number" && idx < len - 1;
  const role = row.role ?? "";
  const speaker = itemSpeakerOf(row);
  return {
    id: row.id,
    isNewest: facts.isNewest,
    hidden: row.isHidden === true,
    generating: row.isGenerating === true,
    role,
    mine: facts.mine,
    hasSwipes: greeting ? hasNext : true,
    greeting,
    channel: row.channel || "main",
    speaker,
    characterLine: role !== "user" && !!speaker?.startsWith("character:")
  };
}

// dist/ui/sessions/conversation/messageOrder.js
function orderedMessages(messages, order) {
  return order === "newest-first" ? [...messages].reverse() : messages;
}
function conversationIndex(row, total, order) {
  return order === "newest-first" ? total - 1 - row : row;
}

// dist/ui/sessions/conversation/messageSpeaker.js
function messageEnvoySlug(msg) {
  const ref = msg.metadata?.speaker;
  return typeof ref === "string" && ref.startsWith("envoy:") ? ref.slice("envoy:".length) : null;
}

// dist/ui/sessions/conversation/text.js
function statusTextIn(status, language, t) {
  if (!status)
    return "";
  const i18n = localeMapOf(status.i18n);
  if (i18n[language] !== void 0)
    return renderStatusText(status, language);
  return renderStatusText({ ...status, i18n: { en: t(i18n.en) } });
}
var resolve = (status) => status ? renderStatusText(status) : "";
var statusText = (status) => resolve(status);
function setStatusTextResolver(language, t) {
  resolve = (status) => statusTextIn(status, language(), t);
}

// dist/ui/sessions/conversation/messageVerbState.js
var isReply = (m) => m.role !== "user" && (!!m.characterId || !!m.isNarratorResponse);
var VERB_REASONS = Object.freeze({
  notYours: "not yours to change",
  editing: "finish the edit first",
  generating: CORE_VERB_REASONS.generating.en,
  hidden: CORE_VERB_REASONS.hidden.en,
  notNewest: CORE_VERB_REASONS.notNewest.en,
  noSwipe: CORE_VERB_REASONS.noSwipe.en
});
function notYoursToUse(action) {
  const heard = audienceVerdict.judge({
    name: action.name,
    refs: action.act,
    portrayals: {},
    viewer: { userId: "" },
    item: false
  });
  return heard.ok ? "" : i18nText(heard.sentence) ?? "";
}
var off = (...conditions) => {
  for (const [holds, reason] of conditions)
    if (holds)
      return {
        shown: true,
        disabled: true,
        ...reason ? { reason } : {}
      };
  return { shown: true, disabled: false };
};
function enabledWhenState(ctx, opts = {}) {
  if (ctx.enabled === false)
    return [true, ctx.reason];
  if (!ctx.itemPredicates?.length)
    return [false, void 0];
  const doc = {
    item: itemValuesOf({
      id: ctx.msg.id ?? 0,
      isHidden: ctx.msg.isHidden,
      isGenerating: ctx.msg.isGenerating,
      role: ctx.msg.role,
      channel: ctx.msg.channel,
      characterId: ctx.msg.characterId,
      personaId: ctx.msg.personaId,
      metadata: ctx.msg.metadata
    }, { isNewest: ctx.isLastMessage, mine: ctx.canControl })
  };
  const heard = enablementVerdict.judge({ preds: ctx.itemPredicates, doc });
  if (heard.ok)
    return [false, void 0];
  return [true, (opts.statusText ?? statusText)({ i18n: heard.sentence }) || (i18nText(heard.sentence) ?? "")];
}
function coreVerbState(key, ctx) {
  const m = ctx.msg;
  const R = VERB_REASONS;
  const when = enabledWhenState(ctx);
  const busy = [when, [ctx.editing, R.editing]];
  const shown = (visible, state2) => visible ? state2 : { ...state2, shown: false };
  switch (key) {
    case "stop":
      return { shown: !!m.isGenerating, disabled: false };
    case "retry":
      return shown(isReply(m) && ctx.isLastMessage && !m.isGenerating, off([!ctx.canControl, R.notYours], when));
    case "extend":
      return shown(isReply(m) && ctx.isLastMessage && !m.isGenerating && !!m.content, off([!ctx.canControl, R.notYours], [!!ctx.extendRefusal, ctx.extendRefusal], ...busy));
    case "edit":
      return off([!ctx.canControl, R.notYours], ...busy);
    case "branch":
      return off([!ctx.canAct, ctx.canAct ? void 0 : notYoursToUse(ctx.action)], ...busy);
    case "swipe":
      return shown(isReply(m) && !m.isGenerating, off([!ctx.canControl, R.notYours], [ctx.editing, R.editing], when));
    case "hide":
    case "delete":
      return off([!ctx.canControl, R.notYours], ...busy);
    default: {
      const notMine = !ctx.canAct || !!ctx.itemGated && !ctx.canControl;
      return shown(!m.isGenerating, off(
        [notMine, notMine ? notYoursToUse(ctx.action) : void 0],
        ...busy,
        // A contributed action declares no busy rule of its own
        // unless its author wrote one; the composer's guard
        // (nothing runs while a reply streams, S5) holds here too.
        [ctx.hasGeneratingMessage, R.generating]
      ));
    }
  }
}
var verbKeyOf = (a) => a.specSlug === "core" ? a.key : `contributed:${a.key}`;
var verdictOf = (a) => ({
  canAct: a.canAct,
  itemGated: a.itemGated,
  action: { name: a.name, act: a.audience.act },
  ...a.enabled !== void 0 ? { enabled: a.enabled } : {},
  ...a.reason ? { reason: statusText(a.reason) || a.reason.i18n.en } : {},
  ...a.itemPredicates?.length ? { itemPredicates: a.itemPredicates } : {}
});
function quickRowActions(primary, ctx) {
  return primary.filter((a) => !(a.specSlug === "core" && a.key === "stop")).map((a) => ({
    action: a,
    state: coreVerbState(verbKeyOf(a), { ...ctx, ...verdictOf(a) })
  })).filter((q) => q.state.shown && !q.state.disabled);
}

// dist/ui/sessions/conversation/slashPalette.js
function slashQueryOf(draft) {
  const m = /^\/([^\s]*)$/.exec(draft);
  return m ? m[1] : null;
}
function parseSlashCommand(draft) {
  const m = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(draft);
  if (!m)
    return null;
  const argument = m[2]?.trim() ?? "";
  return { name: m[1], argument: argument || null };
}
function exactSlashCommand(actions, draft) {
  const parsed = parseSlashCommand(draft);
  if (!parsed)
    return void 0;
  const name = parsed.name.toLowerCase();
  const action = dedupePaletteActions(actions).find((a) => a.slash.toLowerCase() === name);
  return action ? { action, argument: parsed.argument } : void 0;
}
function slashArgumentHint(a) {
  const text3 = a.collects?.text;
  if (!text3)
    return void 0;
  const label2 = text3.label.trim().replace(/[.?!:…]+$/u, "");
  const word = label2 ? label2.charAt(0).toLowerCase() + label2.slice(1) : "text";
  return text3.need === "optional" ? `[<${word}>]` : `<${word}>`;
}
function slashArgumentRefusal(a, argument) {
  if (!argument?.trim() || a.collects?.text)
    return null;
  return `/${a.slash} takes no text`;
}
function dedupePaletteActions(actions) {
  const rows = /* @__PURE__ */ new Map();
  for (const a of actions) {
    const held = rows.get(a.slash);
    if (!held) {
      rows.set(a.slash, a);
      continue;
    }
    if (held.specSlug !== CORE_ACTION_SPEC_ID && a.specSlug === CORE_ACTION_SPEC_ID)
      rows.set(a.slash, a);
  }
  return [...rows.values()];
}
function filterPaletteActions(actions, query) {
  const q = query.trim().toLowerCase();
  const unique = dedupePaletteActions(actions);
  if (!q)
    return unique;
  const byName = unique.filter((a) => a.slash.toLowerCase().startsWith(q));
  const byLabel = unique.filter((a) => !a.slash.toLowerCase().startsWith(q) && (a.name.toLowerCase().includes(q) || a.slash.toLowerCase().includes(q)));
  return [...byName, ...byLabel];
}
function exactPaletteMatch(actions, draft) {
  const q = slashQueryOf(draft);
  if (!q)
    return void 0;
  return dedupePaletteActions(actions).find((a) => a.slash.toLowerCase() === q.toLowerCase());
}
function paletteRowState(a, opts) {
  if (!a.canAct)
    return { disabled: true, reason: notYoursToUse({ name: a.name, act: a.audience.act }) };
  if (a.enabled === false)
    return { disabled: true, ...a.reason ? { reason: a.reason } : {} };
  if (a.itemPredicates?.length && opts.newest !== void 0) {
    const actsOn = a.venue === "extra" ? opts.newest : null;
    const heard = enablementVerdict.judge({
      preds: a.itemPredicates,
      doc: actsOn ? { item: actsOn } : {}
    });
    if (!heard.ok)
      return {
        disabled: true,
        reason: (opts.statusText ?? statusText)({ i18n: heard.sentence }) || (i18nText(heard.sentence) ?? "")
      };
  }
  if (opts.generating)
    return { disabled: true, reason: VERB_REASONS.generating };
  return { disabled: false };
}
function stepHighlight(current, count2, delta) {
  if (count2 <= 0)
    return -1;
  if (current < 0)
    return delta === 1 ? 0 : count2 - 1;
  return (current + delta + count2) % count2;
}

// dist/ui/sessions/conversation/composerTray.js
var ATTACHMENT_KINDS_V1 = ["image", "text", "pdf"];
var KIND_PLURAL = {
  image: "images",
  text: "text files",
  pdf: "PDFs"
};
var KIND_NAME = {
  image: "Images",
  text: "Text files",
  pdf: "PDFs"
};
var KIND_ONE = {
  image: "An image",
  text: "A text file",
  pdf: "A PDF"
};
var KIND_FORMATS = {
  image: "PNG, JPEG, WebP, GIF",
  text: ".txt, .md",
  pdf: ".pdf"
};
function kindList(kinds) {
  return ATTACHMENT_KINDS_V1.filter((k) => kinds.includes(k)).map((k) => KIND_PLURAL[k]).join(" \xB7 ");
}
function readableKinds(readers) {
  if (!readers)
    return [];
  return ATTACHMENT_KINDS_V1.filter((k) => readers.kinds[k]?.allowed);
}
function readersSummary(readers) {
  if (!readers)
    return null;
  const kinds = readableKinds(readers);
  if (!kinds.length)
    return "This reply reads no attachments.";
  return `${readers.calls.length > 1 ? "Can read" : "This reply can read"}: ${kindList(kinds)}`;
}
function readerCallLines(readers) {
  if (!readers)
    return [];
  return readers.calls.map((c) => {
    const who = c.model ? `${c.label} (${c.model})` : c.label;
    const reads = ATTACHMENT_KINDS_V1.filter((k) => c.reads.includes(k)).map((k) => KIND_PLURAL[k]);
    const named = ATTACHMENT_KINDS_V1.filter((k) => c.placeholderFor.includes(k)).map((k) => KIND_PLURAL[k]);
    return `${who}: ${reads.join(", ") || "nothing"}` + (named.length ? ` (${named.join(" and ")} appear to it as a name)` : "");
  });
}
var MiB = 1024 * 1024;
var formatCap = (bytes) => `${Math.round(bytes / MiB)} MB`;
var SVG_REFUSAL = "An SVG can't be attached. Attach an image (PNG, JPEG, WebP, GIF), a text file (.txt, .md) or a PDF.";
var TYPE_REFUSAL = "That file type can't be attached. Attach an image (PNG, JPEG, WebP, GIF), a text file (.txt, .md) or a PDF.";
var startsWith = (head, sig, at = 0) => sig.every((b, i) => head[at + i] === b);
function sniffAttachmentKind(head, filename, type = "") {
  if (startsWith(head, [137, 80, 78, 71]))
    return "image";
  if (startsWith(head, [255, 216, 255]))
    return "image";
  if (startsWith(head, [71, 73, 70, 56]))
    return "image";
  if (startsWith(head, [82, 73, 70, 70]) && startsWith(head, [87, 69, 66, 80], 8))
    return "image";
  if (startsWith(head, [37, 80, 68, 70]))
    return "pdf";
  if (/\.svgz?$/i.test(filename) || type === "image/svg+xml")
    return "svg";
  const textual = /\.(txt|md|markdown)$/i.test(filename) || type === "text/plain" || type === "text/markdown";
  if (!textual)
    return null;
  for (const b of head)
    if (b === 0 || b < 9 || b > 13 && b < 32 && b !== 27)
      return null;
  const start = new TextDecoder("utf-8", { fatal: false }).decode(head.subarray(0, 512)).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>/]/i.test(start))
    return "svg";
  return "text";
}
function preCheckFiles(files, tray, readers) {
  const accept = [];
  const refusals = [];
  const cap = readers?.filesPerMessage ?? 10;
  let room = cap - tray.filter((t) => t.status !== "refused").length;
  files.forEach((f, i) => {
    const refuse = (reason) => refusals.push({ filename: f.name, reason });
    if (f.kind === "svg")
      return refuse(SVG_REFUSAL);
    if (!f.kind)
      return refuse(TYPE_REFUSAL);
    const verdict = readers?.kinds[f.kind];
    if (readers && !verdict?.allowed)
      return refuse(verdict?.reason ?? `Nothing in this reply reads ${KIND_PLURAL[f.kind]}.`);
    if (f.size <= 0)
      return refuse("That file is empty.");
    const limit = readers?.bytesPerKind[f.kind];
    if (limit && f.size > limit)
      return refuse(`${KIND_ONE[f.kind]} can be at most ${formatCap(limit)}.`);
    if (room <= 0)
      return refuse(`A message can carry at most ${cap} files.`);
    room--;
    accept.push(i);
  });
  return { accept, refusals };
}
function uploadingNote(tray) {
  const live = tray.filter((t) => t.status !== "refused");
  const uploading = live.filter((t) => t.status === "uploading").length;
  return uploading ? `Uploading ${uploading} of ${live.length}\u2026` : null;
}
function sendableTrayIds(tray) {
  return tray.filter((t) => t.status === "ready").map((t) => t.id);
}

// components/sessions/messages/MessageComposer.svelte
var root = from_html(`<span data-widget-part="messages.edit-tab-label">Compose</span>`);
var root_1 = from_html(`<sp-tab><span data-widget-part="messages.edit-tab-body"><sp-icon></sp-icon> <!></span></sp-tab>`, 2);
var root_2 = from_html(`<span data-widget-part="messages.edit-tab-label">Preview</span>`);
var root_3 = from_html(`<span data-widget-part="messages.edit-tab-label"> </span>`);
var root_4 = from_html(`<sp-tab><span data-widget-part="messages.edit-tab-body"><!> <!></span></sp-tab>`, 2);
var root_5 = from_html(`<!> <span data-widget-part="messages.edit-more-tabs-label"> </span>`, 1);
var root_6 = from_html(`<sp-icon></sp-icon>`, 2);
var root_7 = from_html(`<button type="button" data-widget-part="messages.edit-more-tabs-option"><!> <span> </span></button>`);
var root_8 = from_html(`<div slot="list-end" data-widget-part="messages.edit-more-tabs"><sp-popover><button slot="trigger" type="button" data-widget-part="messages.edit-more-tabs-button" aria-label="More composer tabs"><span data-widget-part="messages.edit-more-tabs-body"><!></span></button> <div data-widget-part="messages.edit-more-tabs-panel"><header data-widget-part="messages.edit-more-tabs-title"><sp-icon></sp-icon> <p>More</p></header> <article data-widget-part="messages.edit-more-tabs-list"></article></div></sp-popover></div>`, 2);
var root_9 = from_html(`<!> <!>`, 1);
var root_10 = from_html(`<div role="group" aria-label="Message controls" data-widget-part="messages.edit-left"><!></div>`);
var root_11 = from_html(`<sp-tab-panel><sp-composer-field></sp-composer-field></sp-tab-panel>`, 2);
var root_12 = from_html(`<sp-tab-panel><div data-widget-part="messages.edit-preview" role="region" aria-label="Message preview"><div data-widget-part="messages.edit-preview-body"><sp-message-body></sp-message-body></div></div></sp-tab-panel>`, 2);
var root_13 = from_html(`<sp-tab-panel><div role="region"><!></div></sp-tab-panel>`, 2);
var root_14 = from_html(`<div role="group" aria-label="Send controls" data-widget-part="messages.edit-right"><!></div>`);
var root_15 = from_html(`<sp-tabs><!> <!> <!> <div data-widget-part="messages.edit-row"><!> <div data-widget-part="messages.edit-panels"><!> <!> <!></div> <!></div></sp-tabs>`, 2);
function MessageComposer($$anchor, $$props) {
  push($$props, true);
  let markdown = prop($$props, "markdown", 15), placeholder = prop($$props, "placeholder", 3, "Type a message..."), enterBehavior = prop($$props, "enterBehavior", 3, "send"), autofocus2 = prop($$props, "autofocus", 3, false), hideCompose = prop($$props, "hideCompose", 3, false);
  let tabGroup = state("compose");
  user_effect(() => {
    if (hideCompose() && (get(tabGroup) === "compose" || get(tabGroup) === "preview")) {
      set(tabGroup, $$props.extraTabs?.[0]?.value ?? "compose", true);
    }
  });
  let showMoreMenu = state(false);
  let collapsibleExtraTabs = user_derived(() => $$props.extraTabs?.filter((t) => !t.alwaysVisible) ?? []);
  let activeExtraTab = user_derived(() => get(collapsibleExtraTabs).find((t) => t.value === get(tabGroup)));
  const widget = useWidgetContext();
  const submitOnEnter = user_derived(() => widget?.current.layout?.v1?.tier !== "compact");
  const fieldKeys = user_derived(() => [
    $$props.onCancel ? "Escape" : "",
    enterBehavior() === "newline" ? "Control+Enter Meta+Enter" : ""
  ].filter(Boolean).join(" "));
  function handleFieldKey(e) {
    const { key, ctrl, meta } = e.detail;
    if (key === "Escape") $$props.onCancel?.();
    else if (key === "Enter" && (ctrl || meta)) $$props.onSend();
  }
  const heard = /* @__PURE__ */ new WeakMap();
  const writeField = (el) => {
    const v = markdown() ?? "";
    if (heard.get(el) === v) return;
    heard.set(el, v);
    el.removeAttribute("value");
    el.setAttribute("value", v);
  };
  const hear = (e) => {
    if (e.target) heard.set(e.target, e.detail.value);
    markdown(e.detail.value);
  };
  user_effect(() => {
    const fixed = /* @__PURE__ */ new Set(["compose", "preview"]);
    const extra = new Set($$props.extraTabs?.map((t) => t.value) ?? []);
    if (!fixed.has(get(tabGroup)) && !extra.has(get(tabGroup))) {
      set(tabGroup, "compose");
    }
  });
  var sp_tabs = root_15();
  template_effect(() => set_custom_element_data(sp_tabs, "value", get(tabGroup)));
  set_custom_element_data(sp_tabs, "label", "Message composer");
  set_custom_element_data(sp_tabs, "data-widget-part", "messages.edit-tabs");
  var node = child(sp_tabs);
  {
    var consequent_1 = ($$anchor2) => {
      var sp_tab = root_1();
      set_custom_element_data(sp_tab, "value", "compose");
      set_custom_element_data(sp_tab, "label", "Compose");
      set_custom_element_data(sp_tab, "data-widget-part", "messages.edit-tab");
      var span = child(sp_tab);
      var sp_icon = child(span);
      set_custom_element_data(sp_icon, "name", "pen");
      set_custom_element_data(sp_icon, "size", "0.75em");
      var node_1 = sibling(sp_icon, 2);
      {
        var consequent = ($$anchor3) => {
          var span_1 = root();
          append($$anchor3, span_1);
        };
        if_block(node_1, ($$render) => {
          if (get(tabGroup) === "compose") $$render(consequent);
        });
      }
      reset(span);
      reset(sp_tab);
      append($$anchor2, sp_tab);
    };
    if_block(node, ($$render) => {
      if (!hideCompose()) $$render(consequent_1);
    });
  }
  var node_2 = sibling(node, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var sp_tab_1 = root_1();
      set_custom_element_data(sp_tab_1, "value", "preview");
      set_custom_element_data(sp_tab_1, "label", "Preview");
      set_custom_element_data(sp_tab_1, "data-widget-part", "messages.edit-tab");
      var span_2 = child(sp_tab_1);
      var sp_icon_1 = child(span_2);
      set_custom_element_data(sp_icon_1, "name", "eye");
      set_custom_element_data(sp_icon_1, "size", "0.75em");
      var node_3 = sibling(sp_icon_1, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var span_3 = root_2();
          append($$anchor3, span_3);
        };
        if_block(node_3, ($$render) => {
          if (get(tabGroup) === "preview") $$render(consequent_2);
        });
      }
      reset(span_2);
      reset(sp_tab_1);
      append($$anchor2, sp_tab_1);
    };
    if_block(node_2, ($$render) => {
      if (!hideCompose()) $$render(consequent_3);
    });
  }
  var node_4 = sibling(node_2, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var fragment = root_9();
      var node_5 = first_child(fragment);
      each(node_5, 17, () => $$props.extraTabs, index, ($$anchor3, tab) => {
        var sp_tab_2 = root_4();
        template_effect(() => set_custom_element_data(sp_tab_2, "value", get(tab).value));
        template_effect(() => set_custom_element_data(sp_tab_2, "label", get(tab).title));
        set_custom_element_data(sp_tab_2, "data-widget-part", "messages.edit-tab");
        template_effect(() => set_custom_element_data(sp_tab_2, "data-collapsible", get(tab).alwaysVisible ? void 0 : ""));
        var span_4 = child(sp_tab_2);
        var node_6 = child(span_4);
        snippet(node_6, () => get(tab).control ?? noop);
        var node_7 = sibling(node_6, 2);
        {
          var consequent_4 = ($$anchor4) => {
            var span_5 = root_3();
            var text3 = child(span_5, true);
            reset(span_5);
            template_effect(() => set_text(text3, get(tab).title));
            append($$anchor4, span_5);
          };
          if_block(node_7, ($$render) => {
            if (get(tabGroup) === get(tab).value) $$render(consequent_4);
          });
        }
        reset(span_4);
        reset(sp_tab_2);
        append($$anchor3, sp_tab_2);
      });
      var node_8 = sibling(node_5, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div = root_8();
          var sp_popover = child(div);
          set_custom_element_data(sp_popover, "placement", "top");
          template_effect(() => set_custom_element_data(sp_popover, "open", get(showMoreMenu)));
          var button = child(sp_popover);
          var span_6 = child(button);
          var node_9 = child(span_6);
          {
            var consequent_5 = ($$anchor4) => {
              var fragment_1 = root_5();
              var node_10 = first_child(fragment_1);
              snippet(node_10, () => get(activeExtraTab).control ?? noop);
              var span_7 = sibling(node_10, 2);
              var text_1 = child(span_7, true);
              reset(span_7);
              template_effect(() => set_text(text_1, get(activeExtraTab).title));
              append($$anchor4, fragment_1);
            };
            var alternate = ($$anchor4) => {
              var sp_icon_2 = root_6();
              set_custom_element_data(sp_icon_2, "name", "ellipsis-vertical");
              set_custom_element_data(sp_icon_2, "size", "0.9em");
              set_custom_element_data(sp_icon_2, "data-widget-part", "messages.edit-more-tabs-icon");
              append($$anchor4, sp_icon_2);
            };
            if_block(node_9, ($$render) => {
              if (get(activeExtraTab)) $$render(consequent_5);
              else $$render(alternate, -1);
            });
          }
          reset(span_6);
          reset(button);
          var div_1 = sibling(button, 2);
          var header = child(div_1);
          var sp_icon_3 = child(header);
          set_custom_element_data(sp_icon_3, "name", "ellipsis-vertical");
          set_custom_element_data(sp_icon_3, "size", "18");
          next(2);
          reset(header);
          var article = sibling(header, 2);
          each(article, 21, () => get(collapsibleExtraTabs), index, ($$anchor4, tab) => {
            var button_1 = root_7();
            var node_11 = child(button_1);
            snippet(node_11, () => get(tab).control ?? noop);
            var span_8 = sibling(node_11, 2);
            var text_2 = child(span_8, true);
            reset(span_8);
            reset(button_1);
            template_effect(() => {
              set_attribute(button_1, "data-current", get(tabGroup) === get(tab).value ? "" : void 0);
              set_text(text_2, get(tab).title);
            });
            delegated("click", button_1, () => {
              set(tabGroup, get(tab).value, true);
              set(showMoreMenu, false);
            });
            append($$anchor4, button_1);
          });
          reset(article);
          reset(div_1);
          reset(sp_popover);
          reset(div);
          template_effect(() => set_attribute(button, "data-active", get(activeExtraTab) ? "" : void 0));
          event("open-change", sp_popover, (e) => set(showMoreMenu, e.detail.open, true));
          append($$anchor3, div);
        };
        if_block(node_8, ($$render) => {
          if (get(collapsibleExtraTabs).length > 0) $$render(consequent_6);
        });
      }
      append($$anchor2, fragment);
    };
    if_block(node_4, ($$render) => {
      if ($$props.extraTabs) $$render(consequent_7);
    });
  }
  var div_2 = sibling(node_4, 2);
  var node_12 = child(div_2);
  {
    var consequent_8 = ($$anchor2) => {
      var div_3 = root_10();
      var node_13 = child(div_3);
      snippet(node_13, () => $$props.leftControls);
      reset(div_3);
      append($$anchor2, div_3);
    };
    if_block(node_12, ($$render) => {
      if ($$props.leftControls && (get(tabGroup) === "compose" || get(tabGroup) === "preview")) $$render(consequent_8);
    });
  }
  var div_4 = sibling(node_12, 2);
  var node_14 = child(div_4);
  {
    var consequent_9 = ($$anchor2) => {
      var sp_tab_panel = root_11();
      set_custom_element_data(sp_tab_panel, "value", "compose");
      var sp_composer_field = child(sp_tab_panel);
      set_custom_element_data(sp_composer_field, "data-widget-part", "messages.edit-field");
      set_custom_element_data(sp_composer_field, "rows", "1");
      set_custom_element_data(sp_composer_field, "label", "Type your message here");
      template_effect(() => set_custom_element_data(sp_composer_field, "placeholder", placeholder()));
      template_effect(() => set_custom_element_data(sp_composer_field, "submit-on", enterBehavior() === "send" && get(submitOnEnter) ? "enter" : "none"));
      template_effect(() => set_custom_element_data(sp_composer_field, "keys", get(fieldKeys)));
      set_custom_element_data(sp_composer_field, "spellcheck", "true");
      autofocus(sp_composer_field, autofocus2() || void 0);
      attach(sp_composer_field, () => writeField);
      reset(sp_tab_panel);
      delegated("input", sp_composer_field, hear);
      event("submit", sp_composer_field, (e) => {
        hear(e);
        $$props.onSend();
      });
      event("key", sp_composer_field, handleFieldKey);
      append($$anchor2, sp_tab_panel);
    };
    if_block(node_14, ($$render) => {
      if (!hideCompose()) $$render(consequent_9);
    });
  }
  var node_15 = sibling(node_14, 2);
  {
    var consequent_10 = ($$anchor2) => {
      var sp_tab_panel_1 = root_12();
      set_custom_element_data(sp_tab_panel_1, "value", "preview");
      var div_5 = child(sp_tab_panel_1);
      var div_6 = child(div_5);
      var sp_message_body = child(div_6);
      template_effect(() => set_custom_element_data(sp_message_body, "text", markdown()));
      reset(div_6);
      reset(div_5);
      reset(sp_tab_panel_1);
      append($$anchor2, sp_tab_panel_1);
    };
    if_block(node_15, ($$render) => {
      if (!hideCompose()) $$render(consequent_10);
    });
  }
  var node_16 = sibling(node_15, 2);
  {
    var consequent_11 = ($$anchor2) => {
      var fragment_2 = comment();
      var node_17 = first_child(fragment_2);
      each(node_17, 17, () => $$props.extraTabs, index, ($$anchor3, tab) => {
        var sp_tab_panel_2 = root_13();
        template_effect(() => set_custom_element_data(sp_tab_panel_2, "value", get(tab).value));
        var div_7 = child(sp_tab_panel_2);
        var node_18 = child(div_7);
        snippet(node_18, () => get(tab).content ?? noop);
        reset(div_7);
        reset(sp_tab_panel_2);
        template_effect(() => set_attribute(div_7, "aria-label", `${get(tab).title ?? ""} content`));
        append($$anchor3, sp_tab_panel_2);
      });
      append($$anchor2, fragment_2);
    };
    if_block(node_16, ($$render) => {
      if ($$props.extraTabs) $$render(consequent_11);
    });
  }
  reset(div_4);
  var node_19 = sibling(div_4, 2);
  {
    var consequent_12 = ($$anchor2) => {
      var div_8 = root_14();
      var node_20 = child(div_8);
      snippet(node_20, () => $$props.rightControls);
      reset(div_8);
      append($$anchor2, div_8);
    };
    if_block(node_19, ($$render) => {
      if ($$props.rightControls && get(tabGroup) === "compose") $$render(consequent_12);
    });
  }
  reset(div_2);
  reset(sp_tabs);
  delegated("change", sp_tabs, (e) => {
    if (e.target === e.currentTarget) set(tabGroup, e.detail.value, true);
  });
  append($$anchor, sp_tabs);
  pop();
}
delegate(["change", "click", "input"]);

// ../node_modules/svelte/src/reactivity/set.js
var read_methods = ["forEach", "isDisjointFrom", "isSubsetOf", "isSupersetOf"];
var set_like_methods = ["difference", "intersection", "symmetricDifference", "union"];
var inited = false;
var SvelteSet = class _SvelteSet extends Set {
  /** @type {Map<T, Source<boolean>>} */
  #sources = /* @__PURE__ */ new Map();
  #version = state(0);
  #size = state(0);
  #update_version = update_version || -1;
  /**
   * @param {Iterable<T> | null | undefined} [value]
   */
  constructor(value) {
    super();
    if (dev_fallback_default) {
      value = new Set(value);
      tag(this.#version, "SvelteSet version");
      tag(this.#size, "SvelteSet.size");
    }
    if (value) {
      for (var element of value) {
        super.add(element);
      }
      this.#size.v = super.size;
    }
    if (!inited) this.#init();
  }
  /**
   * If the source is being created inside the same reaction as the SvelteSet instance,
   * we use `state` so that it will not be a dependency of the reaction. Otherwise we
   * use `source` so it will be.
   *
   * @template T
   * @param {T} value
   * @returns {Source<T>}
   */
  #source(value) {
    return update_version === this.#update_version ? state(value) : source(value);
  }
  // We init as part of the first instance so that we can treeshake this class
  #init() {
    inited = true;
    var proto = _SvelteSet.prototype;
    var set_proto = Set.prototype;
    for (const method of read_methods) {
      proto[method] = function(...v) {
        get(this.#version);
        return set_proto[method].apply(this, v);
      };
    }
    for (const method of set_like_methods) {
      proto[method] = function(...v) {
        get(this.#version);
        var set2 = (
          /** @type {Set<T>} */
          set_proto[method].apply(this, v)
        );
        return new _SvelteSet(set2);
      };
    }
  }
  /** @param {T} value */
  has(value) {
    var has = super.has(value);
    var sources = this.#sources;
    var s = sources.get(value);
    if (s === void 0) {
      if (!has) {
        get(this.#version);
        return false;
      }
      s = this.#source(true);
      if (dev_fallback_default) {
        tag(s, `SvelteSet has(${label(value)})`);
      }
      sources.set(value, s);
    }
    get(s);
    return has;
  }
  /** @param {T} value */
  add(value) {
    if (!super.has(value)) {
      super.add(value);
      set(this.#size, super.size);
      increment(this.#version);
    }
    return this;
  }
  /** @param {T} value */
  delete(value) {
    var deleted = super.delete(value);
    var sources = this.#sources;
    var s = sources.get(value);
    if (s !== void 0) {
      sources.delete(value);
      set(s, false);
    }
    if (deleted) {
      set(this.#size, super.size);
      increment(this.#version);
    }
    return deleted;
  }
  clear() {
    if (super.size === 0) {
      return;
    }
    super.clear();
    var sources = this.#sources;
    for (var s of sources.values()) {
      set(s, false);
    }
    sources.clear();
    set(this.#size, 0);
    increment(this.#version);
  }
  keys() {
    return this.values();
  }
  values() {
    get(this.#version);
    return super.values();
  }
  entries() {
    get(this.#version);
    return super.entries();
  }
  [Symbol.iterator]() {
    return this.keys();
  }
  get size() {
    return get(this.#size);
  }
};

// ../node_modules/svelte/src/reactivity/url-search-params.js
var REPLACE = /* @__PURE__ */ Symbol("replace");
var SvelteURLSearchParams = class extends URLSearchParams {
  #version = dev_fallback_default ? tag(state(0), "SvelteURLSearchParams version") : state(0);
  #url = get_current_url();
  #updating = false;
  #update_url() {
    if (!this.#url || this.#updating) return;
    this.#updating = true;
    const search = this.toString();
    this.#url.search = search && `?${search}`;
    this.#updating = false;
  }
  /**
   * @param {URLSearchParams} params
   * @internal
   */
  [REPLACE](params) {
    if (this.#updating) return;
    if (params.toString() === super.toString()) return;
    this.#updating = true;
    for (const key of [...super.keys()]) {
      super.delete(key);
    }
    for (const [key, value] of params) {
      super.append(key, value);
    }
    increment(this.#version);
    this.#updating = false;
  }
  /**
   * @param {string} name
   * @param {string} value
   * @returns {void}
   */
  append(name, value) {
    super.append(name, value);
    this.#update_url();
    increment(this.#version);
  }
  /**
   * @param {string} name
   * @param {string=} value
   * @returns {void}
   */
  delete(name, value) {
    var has_value = super.has(name, value);
    super.delete(name, value);
    if (has_value) {
      this.#update_url();
      increment(this.#version);
    }
  }
  /**
   * @param {string} name
   * @returns {string|null}
   */
  get(name) {
    get(this.#version);
    return super.get(name);
  }
  /**
   * @param {string} name
   * @returns {string[]}
   */
  getAll(name) {
    get(this.#version);
    return super.getAll(name);
  }
  /**
   * @param {string} name
   * @param {string=} value
   * @returns {boolean}
   */
  has(name, value) {
    get(this.#version);
    return super.has(name, value);
  }
  keys() {
    get(this.#version);
    return super.keys();
  }
  /**
   * @param {(value: string, key: string, parent: URLSearchParams) => void} callback
   * @param {any} [this_arg]
   * @returns {void}
   */
  forEach(callback, this_arg) {
    get(this.#version);
    super.forEach(callback, this_arg);
  }
  /**
   * @param {string} name
   * @param {string} value
   * @returns {void}
   */
  set(name, value) {
    var previous = super.getAll(name);
    super.set(name, value);
    var current = super.getAll(name);
    if (previous.length !== current.length || previous.some((value2, i) => value2 !== current[i])) {
      this.#update_url();
      increment(this.#version);
    }
  }
  sort() {
    super.sort();
    this.#update_url();
    increment(this.#version);
  }
  toString() {
    get(this.#version);
    return super.toString();
  }
  values() {
    get(this.#version);
    return super.values();
  }
  entries() {
    get(this.#version);
    return super.entries();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  get size() {
    get(this.#version);
    return super.size;
  }
};

// ../node_modules/svelte/src/reactivity/url.js
var current_url = null;
function get_current_url() {
  return current_url;
}

// components/sessions/messages/conversation.svelte.ts
var KEY = /* @__PURE__ */ Symbol("sp-conversation");
function isUnmountDecline(e) {
  const code = typeof e === "object" && e !== null ? e.code : void 0;
  if (code !== void 0) return code === "unmounted";
  const message = e instanceof Error ? e.message : String(e);
  return /\bunmounted\b/.test(message);
}
function createConversation(widget) {
  const ctx = () => widget.current;
  const warn = (what) => (e) => {
    if (isUnmountDecline(e)) return;
    console.warn(`conversation: ${what} \u2014 ${e instanceof Error ? e.message : String(e)}`);
  };
  let editingId = state(null);
  let menuFor = state(void 0);
  let selecting = state(false);
  let lane = state("main");
  const selected = new SvelteSet();
  setStatusTextResolver(() => ctx().locale.v1, (source2) => ctx().t(source2));
  const dossier = user_derived(() => ctx().session_full?.v1 ?? null);
  const channels = user_derived(() => {
    const listed = get(dossier)?.composer?.channels;
    return listed && listed.length ? listed : null;
  });
  const slugOf = (channel) => (typeof channel === "string" && channel ? channel : "main").split(":")[0];
  const rows = user_derived(() => {
    const all = ctx().messages.v1;
    if (!get(channels)) return all;
    const shown = new Set(get(channels));
    return all.filter((m) => shown.has(slugOf(m.channel)));
  });
  let summaryEnded = null;
  user_effect(() => {
    const n = get(dossier)?.summaryEnded ?? 0;
    if (summaryEnded !== null && n !== summaryEnded) {
      set(selecting, false);
      selected.clear();
    }
    summaryEnded = n;
  });
  function invoke(key, subject, payload, text3) {
    try {
      ctx().invoke(key, {
        messageId: subject?.id,
        payload,
        ...text3 !== void 0 ? { text: text3 } : {}
      });
    } catch (e) {
      warn(key)(e);
    }
  }
  function request(kind, params) {
    return ctx().request(kind, params).catch(warn(kind));
  }
  return {
    get ctx() {
      return ctx();
    },
    get dossier() {
      return get(dossier);
    },
    /** The page's word on one line; nothing when it has none. */
    line(id) {
      return get(dossier)?.lines[id] ?? NO_LINE;
    },
    t: (source2) => ctx().t(source2),
    /** A status sentence in the viewer's language. */
    statusText: (status) => statusTextIn(status, ctx().locale.v1, (source2) => ctx().t(source2)),
    /** May the viewer answer a form put to `addressee`? */
    canAnswer(addressee) {
      const f = get(dossier);
      return canAnswerForm(
        addressee,
        {
          userId: ctx().viewer.v1.userId,
          isOwner: !!f?.isOwner,
          isAdmin: ctx().viewer.v1.isAdmin
        },
        f?.cast
      );
    },
    // ── verbs ────────────────────────────────────────────────────────────
    invoke,
    /** A reply swiped: to the newer alternative (right) or the older (left). */
    swipe(subject, direction) {
      invoke("swipe", subject, { direction });
    },
    request,
    // ── editing: the widget's own state; saving is the `edit` verb ───────
    edit: {
      get id() {
        return get(editingId);
      },
      start(subject) {
        set(editingId, subject.id, true);
        set(menuFor, void 0);
      },
      cancel() {
        set(editingId, null);
      },
      save(subject, content) {
        invoke("edit", subject, { content });
        set(editingId, null);
      }
    },
    /** The rows this copy's log holds — its channels' (S1), in the host's order. */
    get rows() {
      return get(rows);
    },
    /** The channels this copy shows, or `null` for every channel. */
    get channels() {
      return get(channels);
    },
    /**
     * What a channel is CALLED: its declared label in the viewer's language
     * (`ChannelDecl.label`, the Lair's _Sanctum_), else its slug, title-cased
     * (`manuscript` reads _Manuscript_).
     */
    channelName(slug) {
      const label2 = get(dossier)?.composer?.channelLabels?.[slug];
      if (label2) return label2;
      return slug.split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    },
    /**
     * The lane the composer writes to; the log shows that lane's rows. It is
     * always one of this copy's channels: a copy told one channel writes on
     * it whatever was chosen before (S1).
     */
    lane: {
      get current() {
        return get(channels) && !get(channels).includes(get(lane)) ? get(channels)[0] : get(lane);
      },
      set(next2) {
        set(lane, next2 || "main", true);
      }
    },
    /** Whose ⋮ menu is open — one at a time across the log. */
    menu: {
      get open() {
        return get(menuFor);
      },
      set(id) {
        set(menuFor, id, true);
      }
    },
    // ── selecting lines for a summary ────────────────────────────────────
    select: {
      get active() {
        return get(selecting);
      },
      get ids() {
        return selected;
      },
      start(subject) {
        set(selecting, true);
        selected.clear();
        if (subject) selected.add(subject.id);
        set(menuFor, void 0);
      },
      stop() {
        set(selecting, false);
        selected.clear();
      },
      toggle(subject) {
        if (get(dossier)?.scened.includes(subject.id)) return;
        if (selected.has(subject.id)) selected.delete(subject.id);
        else selected.add(subject.id);
      },
      set(ids) {
        selected.clear();
        for (const id of ids) selected.add(id);
      },
      /**
       * From a line toward one end, up to the nearest line already
       * selected — never through a line a scene has already captured.
       */
      range(index2, toward) {
        const list = get(rows);
        const taken = new Set(get(dossier)?.scened ?? []);
        const step = toward === "above" ? -1 : 1;
        for (let i = index2; i >= 0 && i < list.length; i += step) {
          const id = list[i].id;
          if (taken.has(id)) break;
          if (selected.has(id) && i !== index2) break;
          selected.add(id);
        }
      },
      /**
       * Hand the selection to the host's summarizer. It stays until the host
       * says the summary finished (`summaryEnded`): a cancelled or failed
       * create keeps a hand-picked selection.
       */
      commit(kind) {
        ctx().request("summarize", { kind, messageIds: [...selected] }).catch(warn("summarize"));
      }
    }
  };
}
function setConversation(c) {
  return setContext(KEY, c);
}
function useConversation() {
  const c = getContext(KEY);
  if (!c) throw new Error("a conversation part rendered outside MessagesWidget");
  return c;
}
function useT() {
  const w = useWidgetContext();
  return (source2) => w?.current.t?.(source2) ?? source2;
}

// components/sessions/messages/MessageControls.svelte
var root2 = from_html(`<span data-widget-part="messages.message-option-note"> </span>`);
var root_16 = from_html(`<button data-widget-part="messages.message-option"><sp-icon></sp-icon> <span> </span></button> <!>`, 3);
var root_22 = from_html(`<button data-widget-part="messages.message-option" title="Select for summary" aria-label="Select this message for summarization"><sp-icon></sp-icon> <span>Select for summary</span></button>`, 2);
var root_32 = from_html(`<button data-widget-part="messages.message-option" title="Choose the face this line shows"><sp-icon></sp-icon> <span>Change sprite</span></button>`, 2);
var root_42 = from_html(`<button data-widget-part="messages.message-option" title="See what the pipeline did for this reply"><sp-icon></sp-icon> <span>Inspect run</span></button>`, 2);
var root_52 = from_html(`<button data-widget-part="messages.message-option" title="Prompt details"><sp-icon></sp-icon> <span>Prompt details</span></button>`, 2);
var root_62 = from_html(`<span data-widget-part="messages.message-option-new" aria-label="New">New</span>`);
var root_72 = from_html(`<button data-widget-part="messages.message-option"><sp-icon></sp-icon> <span> </span> <!></button> <!>`, 3);
var root_82 = from_html(`<hr data-widget-part="messages.message-options-divider"/> <!>`, 1);
var root_92 = from_html(`<div data-widget-part="messages.message-options"><sp-popover><button slot="trigger" type="button" data-widget-part="messages.message-options-button messages.message-icon-button" aria-label="Message options"><sp-icon></sp-icon></button> <div data-widget-part="messages.message-options-panel"><header data-widget-part="messages.message-options-title"><sp-icon></sp-icon> <p>Message options</p></header> <article data-widget-part="messages.message-options-list"><!> <!> <!> <!> <!> <!></article></div></sp-popover></div>`, 2);
function MessageControls($$anchor, $$props) {
  push($$props, true);
  let isLastMessage = prop($$props, "isLastMessage", 3, false);
  const conv = useConversation();
  const open = user_derived(() => conv.menu.open === $$props.msg.id);
  const onOpenChange = (next2) => conv.menu.set(next2 ? $$props.msg.id : void 0);
  const canControl = user_derived(() => conv.line($$props.msg.id).controllable);
  const extendRefusal = user_derived(() => conv.dossier?.extendRefusal);
  const hasGeneratingMessage = user_derived(() => conv.ctx.messages.v1.some((m) => m.isGenerating));
  const messageActions = user_derived(() => conv.ctx.actions?.v1?.message);
  const isAdmin = user_derived(() => conv.ctx.viewer.v1.isAdmin);
  function closeMenu() {
    onOpenChange(false);
  }
  let canChangeSprite = user_derived(() => get(canControl) && !!$$props.msg.characterId && !$$props.msg.isNarratorResponse && !$$props.msg.isGenerating);
  const FLOORS = [
    {
      key: "stop",
      name: "Stop generating",
      icon: "square",
      quick: true
    },
    { key: "edit", name: "Edit", icon: "pencil", quick: true },
    {
      key: "branch",
      name: "Branch from here",
      icon: "git-branch",
      quick: false
    }
  ].map((a) => ({
    ...a,
    specSlug: "core",
    slash: a.key,
    audience: { see: ["participant"], act: ["item"] },
    venue: "message",
    origin: "core",
    floor: true,
    canAct: true,
    itemGated: a.key !== "branch",
    isNew: false,
    enabled: true
  }));
  const listed = user_derived(() => get(messageActions) ? [
    ...get(messageActions).primary,
    ...get(messageActions).overflow
  ] : FLOORS);
  const verbCtx = user_derived(() => ({
    msg: $$props.msg,
    isLastMessage: isLastMessage(),
    editing: conv.edit.id !== null,
    hasGeneratingMessage: get(hasGeneratingMessage),
    canControl: get(canControl),
    extendRefusal: get(extendRefusal)
  }));
  const stateOf = (a) => coreVerbState(verbKeyOf(a), { ...get(verbCtx), ...verdictOf(a) });
  const rows = user_derived(() => get(listed).map((a) => ({ action: a, state: stateOf(a) })).filter((r) => r.state.shown));
  const coreRows = user_derived(() => get(rows).filter((r) => r.action.specSlug === "core"));
  const contributedRows = user_derived(() => get(rows).filter((r) => r.action.specSlug !== "core"));
  const hasNew = user_derived(() => get(contributedRows).some((r) => r.action.isNew));
  function fireCore(_e, key) {
    closeMenu();
    if (key === "edit") return conv.edit.start($$props.msg);
    if (key === "swipe") return conv.swipe($$props.msg, "right");
    conv.invoke(key, $$props.msg);
  }
  function nameOf(a) {
    return a.key === "hide" && a.specSlug === "core" ? $$props.msg.isHidden ? "Unhide" : "Hide" : a.name;
  }
  const titleOf = (a, reason) => reason ? `${nameOf(a)} \u2014 ${reason}` : a.description ? `${nameOf(a)} \u2014 ${a.description}` : nameOf(a);
  const noteIdOf = (a) => `msg-${$$props.msg.id}-note-${actionIdentity(a).replace(/[^a-z0-9-]/g, "-")}`;
  const isReply2 = user_derived(() => !!$$props.msg.characterId || !!$$props.msg.isNarratorResponse);
  user_effect(() => {
    if (!get(open) || !get(hasNew)) return;
    void conv.request("actions-seen", {
      keys: get(contributedRows).filter((r) => r.action.isNew).map((r) => actionIdentity(r.action))
    });
  });
  var div = root_92();
  var sp_popover = child(div);
  set_custom_element_data(sp_popover, "placement", "bottom-end");
  set_custom_element_data(sp_popover, "label", "Message options");
  template_effect(() => set_custom_element_data(sp_popover, "open", get(open)));
  var button = child(sp_popover);
  var sp_icon = child(button);
  set_custom_element_data(sp_icon, "name", "ellipsis-vertical");
  set_custom_element_data(sp_icon, "size", "16");
  reset(button);
  var div_1 = sibling(button, 2);
  var header = child(div_1);
  var sp_icon_1 = child(header);
  set_custom_element_data(sp_icon_1, "name", "ellipsis-vertical");
  set_custom_element_data(sp_icon_1, "size", "18");
  next(2);
  reset(header);
  var article = sibling(header, 2);
  var node = child(article);
  each(node, 17, () => get(coreRows), ({ action, state: state2 }) => action.key, ($$anchor2, $$item) => {
    let action = () => get($$item).action;
    let state2 = () => get($$item).state;
    const iconName = user_derived(() => action().icon || "play");
    var fragment = root_16();
    var button_1 = first_child(fragment);
    var sp_icon_2 = child(button_1);
    template_effect(() => set_custom_element_data(sp_icon_2, "name", get(iconName)));
    set_custom_element_data(sp_icon_2, "size", "16");
    var span = sibling(sp_icon_2, 2);
    var text3 = child(span, true);
    reset(span);
    reset(button_1);
    var node_1 = sibling(button_1, 2);
    {
      var consequent = ($$anchor3) => {
        var span_1 = root2();
        var text_1 = child(span_1, true);
        reset(span_1);
        template_effect(
          ($0) => {
            set_attribute(span_1, "id", $0);
            set_text(text_1, state2().reason);
          },
          [() => noteIdOf(action())]
        );
        append($$anchor3, span_1);
      };
      if_block(node_1, ($$render) => {
        if (state2().reason) $$render(consequent);
      });
    }
    template_effect(
      ($0, $1, $2) => {
        set_attribute(button_1, "data-verb", action().key);
        set_attribute(button_1, "title", $0);
        set_attribute(button_1, "aria-pressed", action().key === "hide" ? !!$$props.msg.isHidden : void 0);
        set_attribute(button_1, "aria-disabled", state2().disabled);
        set_attribute(button_1, "aria-describedby", $1);
        set_text(text3, $2);
      },
      [
        () => titleOf(action(), state2().reason),
        () => state2().reason ? noteIdOf(action()) : void 0,
        () => nameOf(action())
      ]
    );
    delegated("click", button_1, (e) => state2().disabled ? e.preventDefault() : fireCore(e, action().key));
    append($$anchor2, fragment);
  });
  var node_2 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var button_2 = root_22();
      var sp_icon_3 = child(button_2);
      set_custom_element_data(sp_icon_3, "name", "book-marked");
      set_custom_element_data(sp_icon_3, "size", "16");
      next(2);
      reset(button_2);
      template_effect(() => button_2.disabled = conv.edit.id !== null || get(hasGeneratingMessage));
      delegated("click", button_2, () => {
        closeMenu();
        conv.select.start($$props.msg);
      });
      append($$anchor2, button_2);
    };
    if_block(node_2, ($$render) => {
      if (conv.dossier?.writes.lore && !$$props.msg.isGenerating) $$render(consequent_1);
    });
  }
  var node_3 = sibling(node_2, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var button_3 = root_32();
      var sp_icon_4 = child(button_3);
      set_custom_element_data(sp_icon_4, "name", "drama");
      set_custom_element_data(sp_icon_4, "size", "16");
      next(2);
      reset(button_3);
      delegated("click", button_3, () => {
        closeMenu();
        void conv.request("change-sprite", { messageId: $$props.msg.id });
      });
      append($$anchor2, button_3);
    };
    if_block(node_3, ($$render) => {
      if (get(canChangeSprite)) $$render(consequent_2);
    });
  }
  var node_4 = sibling(node_3, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var button_4 = root_42();
      var sp_icon_5 = child(button_4);
      set_custom_element_data(sp_icon_5, "name", "receipt");
      set_custom_element_data(sp_icon_5, "size", "16");
      next(2);
      reset(button_4);
      delegated("click", button_4, () => {
        closeMenu();
        void conv.request("inspect-run", { messageId: $$props.msg.id });
      });
      append($$anchor2, button_4);
    };
    if_block(node_4, ($$render) => {
      if (get(isAdmin) && get(isReply2) && !$$props.msg.isGenerating) $$render(consequent_3);
    });
  }
  var node_5 = sibling(node_4, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var button_5 = root_52();
      var sp_icon_6 = child(button_5);
      set_custom_element_data(sp_icon_6, "name", "info");
      set_custom_element_data(sp_icon_6, "size", "16");
      next(2);
      reset(button_5);
      delegated("click", button_5, () => {
        closeMenu();
        void conv.request("prompt-details", { messageId: $$props.msg.id });
      });
      append($$anchor2, button_5);
    };
    var d = user_derived(() => conv.dossier?.debugPrompts && conv.line($$props.msg.id).promptDetails && !$$props.msg.isGenerating);
    if_block(node_5, ($$render) => {
      if (get(d)) $$render(consequent_4);
    });
  }
  var node_6 = sibling(node_5, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var fragment_1 = root_82();
      var node_7 = sibling(first_child(fragment_1), 2);
      each(node_7, 17, () => get(contributedRows), ({ action, state: state2 }) => actionIdentity(action), ($$anchor3, $$item) => {
        let action = () => get($$item).action;
        let state2 = () => get($$item).state;
        const iconName = user_derived(() => action().icon || "play");
        var fragment_2 = root_72();
        var button_6 = first_child(fragment_2);
        var sp_icon_7 = child(button_6);
        template_effect(() => set_custom_element_data(sp_icon_7, "name", get(iconName)));
        set_custom_element_data(sp_icon_7, "size", "16");
        var span_2 = sibling(sp_icon_7, 2);
        var text_2 = child(span_2, true);
        reset(span_2);
        var node_8 = sibling(span_2, 2);
        {
          var consequent_5 = ($$anchor4) => {
            var span_3 = root_62();
            append($$anchor4, span_3);
          };
          if_block(node_8, ($$render) => {
            if (action().isNew) $$render(consequent_5);
          });
        }
        reset(button_6);
        var node_9 = sibling(button_6, 2);
        {
          var consequent_6 = ($$anchor4) => {
            var span_4 = root2();
            var text_3 = child(span_4, true);
            reset(span_4);
            template_effect(
              ($0) => {
                set_attribute(span_4, "id", $0);
                set_text(text_3, state2().reason);
              },
              [() => noteIdOf(action())]
            );
            append($$anchor4, span_4);
          };
          if_block(node_9, ($$render) => {
            if (state2().reason) $$render(consequent_6);
          });
        }
        template_effect(
          ($0, $1) => {
            set_attribute(button_6, "title", $0);
            set_attribute(button_6, "aria-disabled", state2().disabled);
            set_attribute(button_6, "aria-describedby", $1);
            set_text(text_2, action().name);
          },
          [
            () => titleOf(action(), state2().reason),
            () => state2().reason ? noteIdOf(action()) : void 0
          ]
        );
        delegated("click", button_6, (e) => {
          if (state2().disabled) {
            e.preventDefault();
            return;
          }
          closeMenu();
          conv.invoke(actionIdentity(action()), $$props.msg);
        });
        append($$anchor3, fragment_2);
      });
      append($$anchor2, fragment_1);
    };
    if_block(node_6, ($$render) => {
      if (get(contributedRows).length) $$render(consequent_7);
    });
  }
  reset(article);
  reset(div_1);
  reset(sp_popover);
  reset(div);
  event("open-change", sp_popover, (e) => onOpenChange(e.detail.open));
  append($$anchor, div);
  pop();
}
delegate(["click"]);

// components/sessions/messages/MessageBlocksView.svelte
var root3 = from_html(`<div data-widget-part="messages.block-markdown messages.prose"><sp-message-body></sp-message-body></div>`, 2);
var root_17 = from_html(`<dt data-widget-part="messages.block-kv-label"> </dt> <dd> </dd>`, 1);
var root_23 = from_html(`<dl data-widget-part="messages.block-kv"></dl>`);
var root_33 = from_html(`<th> </th>`);
var root_43 = from_html(`<td> </td>`);
var root_53 = from_html(`<tr></tr>`);
var root_63 = from_html(`<div data-widget-part="messages.block-table-scroll"><table data-widget-part="messages.block-table"><thead><tr></tr></thead><tbody></tbody></table></div>`);
var root_73 = from_html(`<div data-widget-part="messages.block-stat-track meter" role="meter"><div data-widget-part="messages.block-stat-fill"></div></div>`);
var root_83 = from_html(`<div data-widget-part="messages.block-stat"><div data-widget-part="messages.block-stat-head"><span data-widget-part="messages.block-stat-label"> </span> <span data-widget-part="messages.block-stat-value"> </span></div> <!></div>`);
var root_93 = from_html(`<img data-widget-part="messages.block-image"/>`);
var root_102 = from_html(`<p data-widget-part="messages.block-superseded" data-superseded="true"><sp-icon></sp-icon> <span> </span></p>`, 2);
var root_112 = from_html(`<p data-widget-part="messages.block-caption"> </p>`);
var root_122 = from_html(`<span> </span>`);
var root_132 = from_html(`<p data-widget-part="messages.block-answered"><sp-icon></sp-icon> <span data-widget-part="messages.block-answered-label"> </span> <!></p>`, 2);
var root_142 = from_html(`<p data-widget-part="messages.block-awaiting"> </p>`);
var root_152 = from_html(`<button type="button" data-widget-part="messages.block-choice"><sp-icon></sp-icon> </button>`, 2);
var root_162 = from_html(`<div data-widget-part="messages.block-choice-list"></div>`);
var root_172 = from_html(`<div data-widget-part="messages.block-choices" role="group"><!> <!></div>`);
var root_18 = from_html(`<div data-widget-part="messages.block-form" data-answered="true"><!> <p data-widget-part="messages.block-answered"><sp-icon></sp-icon> <span data-widget-part="messages.block-answered-label"> </span></p></div>`, 2);
var root_19 = from_html(`<div data-widget-part="messages.block-form"><!> <p data-widget-part="messages.block-awaiting"> </p></div>`);
var root_20 = from_html(`<input type="checkbox" data-widget-part="messages.block-checkbox"/>`);
var root_21 = from_html(`<sp-option> </sp-option>`, 2);
var root_222 = from_html(`<sp-combobox></sp-combobox>`, 2);
var root_232 = from_html(`<input type="number" data-widget-part="messages.block-input"/>`);
var root_24 = from_html(`<input type="text" data-widget-part="messages.block-input"/>`);
var root_25 = from_html(`<label data-widget-part="messages.block-field"><span data-widget-part="messages.block-field-label"> </span> <!></label>`);
var root_26 = from_html(`<div data-widget-part="messages.block-form"><!> <!> <button type="button" data-widget-part="messages.block-submit"> </button></div>`);
var root_27 = from_html(`<div data-widget-part="messages.block-group"><!></div>`);
var root_28 = from_html(`<div data-widget-part="messages.blocks"></div>`);
function MessageBlocksView_1($$anchor, $$props) {
  push($$props, true);
  const t = useT();
  let depth = prop($$props, "depth", 3, 1);
  const superseded = (b) => !answeredOf(b) && !!$$props.isStale && $$props.isStale(b);
  const addresseeOf = (b) => typeof b?.addressee === "string" && b.addressee ? b.addressee : void 0;
  const mayAnswer = (b) => !$$props.canAnswer || $$props.canAnswer(addresseeOf(b));
  const caption = (b) => {
    if (typeof b?.question !== "string" || !b.question.trim()) return null;
    const q = b.question.trim();
    return $$props.bodyText && $$props.bodyText.trim().includes(q) ? null : q;
  };
  const blockIdOf = (b) => typeof b?.id === "string" && b.id ? b.id : void 0;
  let formDrafts = proxy({});
  function editField(i, key, value) {
    formDrafts[i] = { ...formDrafts[i] ?? {}, [key]: value };
  }
  function submitForm(i, block) {
    if (!$$props.onAction) return;
    const values = {};
    for (const [key, decl] of Object.entries(block.fields ?? {})) if (decl?.default !== void 0) values[key] = decl.default;
    Object.assign(values, formDrafts[i] ?? {});
    $$props.onAction(block.fn, values, identityOf(block), blockIdOf(block));
  }
  const identityOf = (b) => typeof b?.action === "string" && b.action ? b.action : void 0;
  const fieldLabel = (key, decl) => typeof decl?.label === "string" ? decl.label : decl?.label?.en ?? key;
  var div = root_28();
  each(div, 21, () => $$props.blocks, index, ($$anchor2, block, i) => {
    var fragment = comment();
    var node = first_child(fragment);
    {
      var consequent = ($$anchor3) => {
        var div_1 = root3();
        var sp_message_body = child(div_1);
        template_effect(($0) => set_custom_element_data(sp_message_body, "text", $0), [() => String(get(block).text ?? "")]);
        reset(div_1);
        append($$anchor3, div_1);
      };
      var consequent_1 = ($$anchor3) => {
        var dl = root_23();
        each(dl, 21, () => get(block).rows ?? [], index, ($$anchor4, row) => {
          var fragment_1 = root_17();
          var dt = first_child(fragment_1);
          var text3 = child(dt, true);
          reset(dt);
          var dd = sibling(dt, 2);
          var text_1 = child(dd, true);
          reset(dd);
          template_effect(() => {
            set_text(text3, get(row).label);
            set_text(text_1, get(row).value);
          });
          append($$anchor4, fragment_1);
        });
        reset(dl);
        append($$anchor3, dl);
      };
      var consequent_2 = ($$anchor3) => {
        var div_2 = root_63();
        var table = child(div_2);
        var thead = child(table);
        var tr = child(thead);
        each(tr, 21, () => get(block).columns ?? [], index, ($$anchor4, col) => {
          var th = root_33();
          var text_2 = child(th, true);
          reset(th);
          template_effect(() => set_text(text_2, get(col)));
          append($$anchor4, th);
        });
        reset(tr);
        reset(thead);
        var tbody = sibling(thead);
        each(tbody, 21, () => get(block).rows ?? [], index, ($$anchor4, row) => {
          var tr_1 = root_53();
          each(tr_1, 21, () => get(row), index, ($$anchor5, cell) => {
            var td = root_43();
            var text_3 = child(td, true);
            reset(td);
            template_effect(() => set_text(text_3, get(cell)));
            append($$anchor5, td);
          });
          reset(tr_1);
          append($$anchor4, tr_1);
        });
        reset(tbody);
        reset(table);
        reset(div_2);
        append($$anchor3, div_2);
      };
      var consequent_4 = ($$anchor3) => {
        var div_3 = root_83();
        var div_4 = child(div_3);
        var span = child(div_4);
        var text_4 = child(span, true);
        reset(span);
        var span_1 = sibling(span, 2);
        var text_5 = child(span_1);
        reset(span_1);
        reset(div_4);
        var node_1 = sibling(div_4, 2);
        {
          var consequent_3 = ($$anchor4) => {
            var div_5 = root_73();
            set_attribute(div_5, "aria-valuemin", 0);
            var div_6 = child(div_5);
            reset(div_5);
            template_effect(
              ($0) => {
                set_attribute(div_5, "aria-label", get(block).label);
                set_attribute(div_5, "aria-valuenow", get(block).value);
                set_attribute(div_5, "aria-valuemax", get(block).max);
                set_style(div_6, `--sp-fill: ${$0 ?? ""}%`);
              },
              [
                () => Math.max(0, Math.min(100, get(block).value / get(block).max * 100))
              ]
            );
            append($$anchor4, div_5);
          };
          if_block(node_1, ($$render) => {
            if (get(block).max) $$render(consequent_3);
          });
        }
        reset(div_3);
        template_effect(() => {
          set_text(text_4, get(block).label);
          set_text(text_5, `${get(block).value ?? ""}${get(block).max != null ? ` / ${get(block).max}` : ""}`);
        });
        append($$anchor3, div_3);
      };
      var consequent_5 = ($$anchor3) => {
        var img = root_93();
        template_effect(() => {
          set_attribute(img, "src", `/session-assets/${get(block).assetId ?? ""}`);
          set_attribute(img, "alt", get(block).alt ?? "attachment");
        });
        append($$anchor3, img);
      };
      var consequent_6 = ($$anchor3) => {
        var p = root_102();
        var sp_icon = child(p);
        set_custom_element_data(sp_icon, "name", "history");
        set_custom_element_data(sp_icon, "size", "14");
        var span_2 = sibling(sp_icon, 2);
        var text_6 = child(span_2, true);
        reset(span_2);
        reset(p);
        template_effect(
          ($0, $1) => {
            set_attribute(p, "data-block-id", $0);
            set_text(text_6, $1);
          },
          [
            () => blockIdOf(get(block)),
            () => t("Superseded \u2014 the conversation moved on")
          ]
        );
        append($$anchor3, p);
      };
      var d_1 = user_derived(() => get(block)?.kind === "choices" && superseded(get(block)));
      var consequent_11 = ($$anchor3) => {
        const answered = user_derived(() => answeredOf(get(block)));
        var div_7 = root_172();
        var node_2 = child(div_7);
        {
          var consequent_7 = ($$anchor4) => {
            var p_1 = root_112();
            var text_7 = child(p_1, true);
            reset(p_1);
            template_effect(($0) => set_text(text_7, $0), [() => caption(get(block))]);
            append($$anchor4, p_1);
          };
          var d_2 = user_derived(() => caption(get(block)));
          if_block(node_2, ($$render) => {
            if (get(d_2)) $$render(consequent_7);
          });
        }
        var node_3 = sibling(node_2, 2);
        {
          var consequent_9 = ($$anchor4) => {
            var p_2 = root_132();
            var sp_icon_1 = child(p_2);
            set_custom_element_data(sp_icon_1, "name", "check");
            set_custom_element_data(sp_icon_1, "size", "14");
            var span_3 = sibling(sp_icon_1, 2);
            var text_8 = child(span_3, true);
            reset(span_3);
            var node_4 = sibling(span_3, 2);
            {
              var consequent_8 = ($$anchor5) => {
                var span_4 = root_122();
                var text_9 = child(span_4);
                reset(span_4);
                template_effect(($0) => set_text(text_9, `\xB7 ${$0 ?? ""}`), [() => answeredChoiceLabel(get(block), get(answered))]);
                append($$anchor5, span_4);
              };
              var d_3 = user_derived(() => answeredChoiceLabel(get(block), get(answered)));
              if_block(node_4, ($$render) => {
                if (get(d_3)) $$render(consequent_8);
              });
            }
            reset(p_2);
            template_effect(($0) => set_text(text_8, $0), [() => t("Answered")]);
            append($$anchor4, p_2);
          };
          var consequent_10 = ($$anchor4) => {
            var p_3 = root_142();
            var text_10 = child(p_3, true);
            reset(p_3);
            template_effect(($0) => set_text(text_10, $0), [() => t("Awaiting an answer")]);
            append($$anchor4, p_3);
          };
          var d_4 = user_derived(() => !mayAnswer(get(block)));
          var alternate = ($$anchor4) => {
            var div_8 = root_162();
            each(div_8, 21, () => get(block).actions ?? [], index, ($$anchor5, action) => {
              var button = root_152();
              var sp_icon_2 = child(button);
              set_custom_element_data(sp_icon_2, "name", "play");
              set_custom_element_data(sp_icon_2, "size", "14");
              var text_11 = sibling(sp_icon_2);
              reset(button);
              template_effect(() => {
                button.disabled = !$$props.onAction;
                set_text(text_11, ` ${get(action).label ?? ""}`);
              });
              delegated("click", button, () => $$props.onAction?.(get(action).fn, typeof get(action).choice === "string" ? { choice: get(action).choice } : {}, identityOf(get(action)), blockIdOf(get(block))));
              append($$anchor5, button);
            });
            reset(div_8);
            append($$anchor4, div_8);
          };
          if_block(node_3, ($$render) => {
            if (get(answered)) $$render(consequent_9);
            else if (get(d_4)) $$render(consequent_10, 1);
            else $$render(alternate, -1);
          });
        }
        reset(div_7);
        template_effect(
          ($0, $1) => {
            set_attribute(div_7, "aria-label", $0);
            set_attribute(div_7, "data-answered", get(answered) ? "true" : void 0);
            set_attribute(div_7, "data-block-id", $1);
          },
          [
            () => typeof get(block).question === "string" && get(block).question ? get(block).question : t("Choices"),
            () => blockIdOf(get(block))
          ]
        );
        append($$anchor3, div_7);
      };
      var consequent_12 = ($$anchor3) => {
        var p_4 = root_102();
        var sp_icon_3 = child(p_4);
        set_custom_element_data(sp_icon_3, "name", "history");
        set_custom_element_data(sp_icon_3, "size", "14");
        var span_5 = sibling(sp_icon_3, 2);
        var text_12 = child(span_5, true);
        reset(span_5);
        reset(p_4);
        template_effect(
          ($0, $1) => {
            set_attribute(p_4, "data-block-id", $0);
            set_text(text_12, $1);
          },
          [
            () => blockIdOf(get(block)),
            () => t("Superseded \u2014 the conversation moved on")
          ]
        );
        append($$anchor3, p_4);
      };
      var d_5 = user_derived(() => get(block)?.kind === "form" && superseded(get(block)));
      var consequent_14 = ($$anchor3) => {
        var div_9 = root_18();
        var node_5 = child(div_9);
        {
          var consequent_13 = ($$anchor4) => {
            var p_5 = root_112();
            var text_13 = child(p_5, true);
            reset(p_5);
            template_effect(($0) => set_text(text_13, $0), [() => caption(get(block))]);
            append($$anchor4, p_5);
          };
          var d_6 = user_derived(() => caption(get(block)));
          if_block(node_5, ($$render) => {
            if (get(d_6)) $$render(consequent_13);
          });
        }
        var p_6 = sibling(node_5, 2);
        var sp_icon_4 = child(p_6);
        set_custom_element_data(sp_icon_4, "name", "check");
        set_custom_element_data(sp_icon_4, "size", "14");
        var span_6 = sibling(sp_icon_4, 2);
        var text_14 = child(span_6, true);
        reset(span_6);
        reset(p_6);
        reset(div_9);
        template_effect(
          ($0, $1) => {
            set_attribute(div_9, "data-block-id", $0);
            set_text(text_14, $1);
          },
          [() => blockIdOf(get(block)), () => t("Answered")]
        );
        append($$anchor3, div_9);
      };
      var d_7 = user_derived(() => get(block)?.kind === "form" && answeredOf(get(block)));
      var consequent_16 = ($$anchor3) => {
        var div_10 = root_19();
        var node_6 = child(div_10);
        {
          var consequent_15 = ($$anchor4) => {
            var p_7 = root_112();
            var text_15 = child(p_7, true);
            reset(p_7);
            template_effect(($0) => set_text(text_15, $0), [() => caption(get(block))]);
            append($$anchor4, p_7);
          };
          var d_8 = user_derived(() => caption(get(block)));
          if_block(node_6, ($$render) => {
            if (get(d_8)) $$render(consequent_15);
          });
        }
        var p_8 = sibling(node_6, 2);
        var text_16 = child(p_8, true);
        reset(p_8);
        reset(div_10);
        template_effect(
          ($0, $1) => {
            set_attribute(div_10, "data-block-id", $0);
            set_text(text_16, $1);
          },
          [() => blockIdOf(get(block)), () => t("Awaiting an answer")]
        );
        append($$anchor3, div_10);
      };
      var d_9 = user_derived(() => get(block)?.kind === "form" && !mayAnswer(get(block)));
      var consequent_21 = ($$anchor3) => {
        var div_11 = root_26();
        var node_7 = child(div_11);
        {
          var consequent_17 = ($$anchor4) => {
            var p_9 = root_112();
            var text_17 = child(p_9, true);
            reset(p_9);
            template_effect(($0) => set_text(text_17, $0), [() => caption(get(block))]);
            append($$anchor4, p_9);
          };
          var d_10 = user_derived(() => caption(get(block)));
          if_block(node_7, ($$render) => {
            if (get(d_10)) $$render(consequent_17);
          });
        }
        var node_8 = sibling(node_7, 2);
        each(node_8, 17, () => Object.entries(get(block).fields ?? {}), index, ($$anchor4, $$item) => {
          var $$array = user_derived(() => to_array(get($$item), 2));
          let key = () => get($$array)[0];
          let decl = () => get($$array)[1];
          const d = user_derived(decl);
          var label2 = root_25();
          var span_7 = child(label2);
          var text_18 = child(span_7, true);
          reset(span_7);
          var node_9 = sibling(span_7, 2);
          {
            var consequent_18 = ($$anchor5) => {
              var input = root_20();
              remove_input_defaults(input);
              template_effect(() => set_checked(input, !!(formDrafts[i]?.[key()] ?? get(d).default)));
              delegated("change", input, (e) => editField(i, key(), e.currentTarget.checked));
              append($$anchor5, input);
            };
            var consequent_19 = ($$anchor5) => {
              var sp_combobox = root_222();
              set_custom_element_data(sp_combobox, "data-widget-part", "messages.block-select");
              template_effect(() => set_custom_element_data(sp_combobox, "label", key()));
              template_effect(($0) => set_custom_element_data(sp_combobox, "value", $0), [
                () => String(formDrafts[i]?.[key()] ?? get(d).default ?? "")
              ]);
              each(sp_combobox, 21, () => get(d).of ?? [], index, ($$anchor6, opt) => {
                var sp_option = root_21();
                template_effect(() => set_custom_element_data(sp_option, "value", get(opt)));
                var text_19 = child(sp_option, true);
                reset(sp_option);
                template_effect(() => set_text(text_19, get(opt)));
                append($$anchor6, sp_option);
              });
              reset(sp_combobox);
              delegated("change", sp_combobox, (e) => editField(i, key(), e.detail.value));
              append($$anchor5, sp_combobox);
            };
            var consequent_20 = ($$anchor5) => {
              var input_1 = root_232();
              remove_input_defaults(input_1);
              template_effect(() => {
                set_attribute(input_1, "step", get(d).type === "integer" ? "1" : "any");
                set_value(input_1, formDrafts[i]?.[key()] ?? get(d).default ?? "");
              });
              delegated("input", input_1, (e) => {
                const n = Number(e.currentTarget.value);
                editField(i, key(), Number.isFinite(n) ? n : void 0);
              });
              append($$anchor5, input_1);
            };
            var alternate_1 = ($$anchor5) => {
              var input_2 = root_24();
              remove_input_defaults(input_2);
              template_effect(($0) => set_value(input_2, $0), [
                () => String(formDrafts[i]?.[key()] ?? get(d).default ?? "")
              ]);
              delegated("input", input_2, (e) => editField(i, key(), e.currentTarget.value));
              append($$anchor5, input_2);
            };
            if_block(node_9, ($$render) => {
              if (get(d).type === "boolean") $$render(consequent_18);
              else if (get(d).type === "enum") $$render(consequent_19, 1);
              else if (get(d).type === "number" || get(d).type === "integer") $$render(consequent_20, 2);
              else $$render(alternate_1, -1);
            });
          }
          reset(label2);
          template_effect(($0) => set_text(text_18, $0), [() => fieldLabel(key(), get(d))]);
          append($$anchor4, label2);
        });
        var button_1 = sibling(node_8, 2);
        var text_20 = child(button_1, true);
        reset(button_1);
        reset(div_11);
        template_effect(
          ($0) => {
            set_attribute(div_11, "data-block-id", $0);
            button_1.disabled = !$$props.onAction;
            set_text(text_20, get(block).label ?? "Submit");
          },
          [() => blockIdOf(get(block))]
        );
        delegated("click", button_1, () => submitForm(i, get(block)));
        append($$anchor3, div_11);
      };
      var consequent_22 = ($$anchor3) => {
        var div_12 = root_27();
        var node_10 = child(div_12);
        {
          let $0 = user_derived(() => depth() + 1);
          MessageBlocksView_1(node_10, {
            get blocks() {
              return get(block).blocks;
            },
            get onAction() {
              return $$props.onAction;
            },
            get bodyText() {
              return $$props.bodyText;
            },
            get canAnswer() {
              return $$props.canAnswer;
            },
            get isStale() {
              return $$props.isStale;
            },
            get depth() {
              return get($0);
            }
          });
        }
        reset(div_12);
        template_effect(() => set_attribute(div_12, "data-layout", get(block).layout === "row" ? "row" : "column"));
        append($$anchor3, div_12);
      };
      var d_11 = user_derived(() => get(block)?.kind === "group" && Array.isArray(get(block).blocks) && depth() < 3);
      if_block(node, ($$render) => {
        if (get(block)?.kind === "md") $$render(consequent);
        else if (get(block)?.kind === "kv") $$render(consequent_1, 1);
        else if (get(block)?.kind === "table") $$render(consequent_2, 2);
        else if (get(block)?.kind === "stat") $$render(consequent_4, 3);
        else if (get(block)?.kind === "image" && get(block).assetId != null) $$render(consequent_5, 4);
        else if (get(d_1)) $$render(consequent_6, 5);
        else if (get(block)?.kind === "choices") $$render(consequent_11, 6);
        else if (get(d_5)) $$render(consequent_12, 7);
        else if (get(d_7)) $$render(consequent_14, 8);
        else if (get(d_9)) $$render(consequent_16, 9);
        else if (get(block)?.kind === "form") $$render(consequent_21, 10);
        else if (get(d_11)) $$render(consequent_22, 11);
      });
    }
    append($$anchor2, fragment);
  });
  reset(div);
  template_effect(() => set_attribute(div, "data-depth", depth()));
  append($$anchor, div);
  pop();
}
delegate(["click", "change", "input"]);

// components/sessions/messages/MessagePartsView.svelte
var root4 = from_html(`<sp-icon></sp-icon>`, 2);
var root_110 = from_html(`<li> </li>`);
var root_29 = from_html(`<ul data-widget-part="messages.fold-list"></ul>`);
var root_34 = from_html(`<sp-message-body></sp-message-body>`, 2);
var root_44 = from_html(`<div data-widget-part="messages.part-disclosure"><button type="button" data-widget-part="messages.part-disclosure-toggle"><!> <span> </span> <sp-icon></sp-icon></button> <div data-widget-part="messages.part-disclosure-track"><div data-widget-part="messages.part-disclosure-clip"><div data-widget-part="messages.part-disclosure-panel messages.prose"><!></div></div></div></div>`, 2);
var root_54 = from_html(`<hr data-widget-part="messages.part-step-divider"/>`);
var root_64 = from_html(`<div data-widget-part="messages.part-markdown messages.prose"><sp-message-body></sp-message-body></div>`, 2);
var root_74 = from_html(`<!> <!>`, 1);
function MessagePartsView($$anchor, $$props) {
  push($$props, true);
  const collapsible = ($$anchor2, part = noop, title = noop, icon = noop, body = noop, items = noop) => {
    var div = root_44();
    var button = child(div);
    var node = child(button);
    {
      var consequent = ($$anchor3) => {
        var sp_icon = root4();
        set_custom_element_data(sp_icon, "name", "brain-circuit");
        set_custom_element_data(sp_icon, "size", "16");
        append($$anchor3, sp_icon);
      };
      var consequent_1 = ($$anchor3) => {
        var sp_icon_1 = root4();
        set_custom_element_data(sp_icon_1, "name", "notebook-pen");
        set_custom_element_data(sp_icon_1, "size", "16");
        append($$anchor3, sp_icon_1);
      };
      var consequent_2 = ($$anchor3) => {
        var sp_icon_2 = root4();
        set_custom_element_data(sp_icon_2, "name", "wrench");
        set_custom_element_data(sp_icon_2, "size", "16");
        append($$anchor3, sp_icon_2);
      };
      var alternate = ($$anchor3) => {
        var sp_icon_3 = root4();
        set_custom_element_data(sp_icon_3, "name", "puzzle");
        set_custom_element_data(sp_icon_3, "size", "16");
        append($$anchor3, sp_icon_3);
      };
      if_block(node, ($$render) => {
        if (icon() === "brain") $$render(consequent);
        else if (icon() === "notebook") $$render(consequent_1, 1);
        else if (icon() === "wrench") $$render(consequent_2, 2);
        else $$render(alternate, -1);
      });
    }
    var span = sibling(node, 2);
    var text3 = child(span, true);
    reset(span);
    var sp_icon_4 = sibling(span, 2);
    set_custom_element_data(sp_icon_4, "name", "chevron-down");
    set_custom_element_data(sp_icon_4, "size", "16");
    set_custom_element_data(sp_icon_4, "data-widget-part", "messages.part-disclosure-chevron");
    reset(button);
    var div_1 = sibling(button, 2);
    var div_2 = child(div_1);
    var div_3 = child(div_2);
    var node_1 = child(div_3);
    {
      var consequent_3 = ($$anchor3) => {
        var ul = root_29();
        each(ul, 21, items, index, ($$anchor4, item) => {
          var li = root_110();
          var text_1 = child(li, true);
          reset(li);
          template_effect(() => set_text(text_1, get(item)));
          append($$anchor4, li);
        });
        reset(ul);
        append($$anchor3, ul);
      };
      var alternate_1 = ($$anchor3) => {
        var sp_message_body = root_34();
        template_effect(() => set_custom_element_data(sp_message_body, "text", body()));
        append($$anchor3, sp_message_body);
      };
      if_block(node_1, ($$render) => {
        if (items()) $$render(consequent_3);
        else $$render(alternate_1, -1);
      });
    }
    reset(div_3);
    reset(div_2);
    reset(div_1);
    reset(div);
    template_effect(() => {
      set_attribute(button, "title", expanded[part().id] ? `Collapse ${title()}` : `Expand ${title()}`);
      set_attribute(button, "aria-expanded", !!expanded[part().id]);
      set_attribute(button, "aria-controls", `part-${$$props.messageId ?? ""}-${part().id ?? ""}`);
      set_text(text3, title());
      set_attribute(div_1, "id", `part-${$$props.messageId ?? ""}-${part().id ?? ""}`);
      set_attribute(div_1, "data-expanded", expanded[part().id] ? "" : void 0);
    });
    delegated("click", button, () => expanded[part().id] = !expanded[part().id]);
    append($$anchor2, div);
  };
  let expanded = proxy({});
  const steps = user_derived(() => [...new Set($$props.parts.map((p) => p.step))].sort((a, b) => a - b));
  function visibleParts(step) {
    const active = $$props.activeRevisions[String(step)] ?? 0;
    return $$props.parts.filter((p) => p.step === step && p.revision === active).sort((a, b) => a.ordinal - b.ordinal);
  }
  function sectionTitle(part) {
    const t = part.data?.title;
    if (typeof t === "string" && t) return t;
    return "Section";
  }
  function sectionItems(part) {
    const items = part.data?.items;
    return Array.isArray(items) && items.every((i) => typeof i === "string") ? items : void 0;
  }
  function sectionIcon(part) {
    return part.data?.kind === "reasoning" ? "brain" : "notebook";
  }
  function unknownBody(part) {
    if (part.content) return part.content;
    try {
      return "```json\n" + JSON.stringify(part.data ?? {}, null, 2) + "\n```";
    } catch {
      return "";
    }
  }
  var fragment = comment();
  var node_2 = first_child(fragment);
  each(node_2, 18, () => get(steps), (step) => step, ($$anchor2, step, i) => {
    var fragment_1 = root_74();
    var node_3 = first_child(fragment_1);
    {
      var consequent_4 = ($$anchor3) => {
        var hr = root_54();
        append($$anchor3, hr);
      };
      if_block(node_3, ($$render) => {
        if (get(i) > 0) $$render(consequent_4);
      });
    }
    var node_4 = sibling(node_3, 2);
    each(node_4, 17, () => visibleParts(step), (part) => part.id, ($$anchor3, part) => {
      var fragment_2 = comment();
      var node_5 = first_child(fragment_2);
      {
        var consequent_5 = ($$anchor4) => {
          var div_4 = root_64();
          var sp_message_body_1 = child(div_4);
          template_effect(() => set_custom_element_data(sp_message_body_1, "text", get(part).content ?? ""));
          reset(div_4);
          event("open-image", sp_message_body_1, (e) => $$props.onOpenImage?.(e.detail.src));
          append($$anchor4, div_4);
        };
        var consequent_6 = ($$anchor4) => {
          collapsible($$anchor4, () => get(part), () => "Reasoning", () => "brain", () => get(part).content ?? "");
        };
        var consequent_7 = ($$anchor4) => {
          {
            let $0 = user_derived(() => get(part).content ?? unknownBody(get(part)));
            collapsible($$anchor4, () => get(part), () => get(part).data?.tool ? `Tool: ${get(part).data.tool}` : "Tool call", () => "wrench", () => get($0));
          }
        };
        var consequent_8 = ($$anchor4) => {
          {
            let $0 = user_derived(() => get(part).content ?? unknownBody(get(part)));
            collapsible($$anchor4, () => get(part), () => "Tool result", () => "wrench", () => get($0));
          }
        };
        var consequent_9 = ($$anchor4) => {
          {
            let $0 = user_derived(() => sectionTitle(get(part)));
            let $1 = user_derived(() => sectionIcon(get(part)));
            let $2 = user_derived(() => sectionItems(get(part)));
            collapsible($$anchor4, () => get(part), () => get($0), () => get($1), () => get(part).content ?? "", () => get($2));
          }
        };
        var consequent_10 = ($$anchor4) => {
        };
        var consequent_11 = ($$anchor4) => {
          MessageBlocksView_1($$anchor4, {
            get blocks() {
              return get(part).data.blocks;
            },
            get onAction() {
              return $$props.onAction;
            },
            get bodyText() {
              return $$props.bodyText;
            },
            get canAnswer() {
              return $$props.canAnswer;
            },
            get isStale() {
              return $$props.isStale;
            }
          });
        };
        var d = user_derived(() => Array.isArray(get(part).data?.blocks));
        var alternate_2 = ($$anchor4) => {
          {
            let $0 = user_derived(() => unknownBody(get(part)));
            collapsible($$anchor4, () => get(part), () => get(part).type, () => "puzzle", () => get($0));
          }
        };
        if_block(node_5, ($$render) => {
          if (get(part).type === "core:markdown") $$render(consequent_5);
          else if (get(part).type === "core:reasoning") $$render(consequent_6, 1);
          else if (get(part).type === "core:tool-call") $$render(consequent_7, 2);
          else if (get(part).type === "core:tool-result") $$render(consequent_8, 3);
          else if (get(part).type === "core:section") $$render(consequent_9, 4);
          else if (get(part).type === "core:image" || get(part).type === "core:file") $$render(consequent_10, 5);
          else if (get(d)) $$render(consequent_11, 6);
          else $$render(alternate_2, -1);
        });
      }
      append($$anchor3, fragment_2);
    });
    append($$anchor2, fragment_1);
  });
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);

// components/sessions/messages/mediaStrip.ts
var MEDIA_STRIP_MAX_TILES = 6;
var text2 = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
var count = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
function mediaStripItems(parts, activeRevisions) {
  if (!parts?.length) return [];
  const active = activeRevisions ?? {};
  return parts.filter(
    (p) => (p.type === "core:image" || p.type === "core:file") && p.revision === (active[String(p.step)] ?? 0) && count(p.data?.assetId) !== null
  ).sort((a, b) => a.step - b.step || a.ordinal - b.ordinal).map((p) => {
    const d = p.data ?? {};
    const kind = p.type === "core:image" ? "image" : "file";
    const name = text2(d.filename) ?? text2(d.name);
    return {
      partId: p.id,
      kind,
      assetId: d.assetId,
      label: text2(d.alt) ?? name ?? (kind === "image" ? "Image" : "File"),
      name,
      width: count(d.width),
      height: count(d.height),
      mime: text2(d.mime),
      bytes: count(d.bytes)
    };
  });
}
function mediaSrc(assetId, variant) {
  return variant ? `/media/${assetId}?v=${variant}` : `/media/${assetId}`;
}
function mediaDownloadHref(assetId) {
  return `/media/${assetId}?download=1`;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fileIcon(mime) {
  if (!mime) return "file";
  if (mime.startsWith("text/") || mime === "application/pdf") return "file-text";
  return "file";
}
function viewImageParams(images, index2) {
  const srcs = images.map((i) => mediaSrc(i.assetId));
  return {
    src: srcs[index2],
    gallery: { srcs, index: index2, captions: images.map((i) => i.label) }
  };
}

// components/sessions/messages/MessageMediaStrip.svelte
var gone = ($$anchor, item = noop) => {
  var div = root_111();
  var sp_icon_1 = child(div);
  set_custom_element_data(sp_icon_1, "name", "image-off");
  set_custom_element_data(sp_icon_1, "size", "20");
  next(2);
  reset(div);
  template_effect(() => set_attribute(div, "aria-label", `${item().label ?? ""}: file no longer available`));
  append($$anchor, div);
};
var root5 = from_html(`<button type="button" data-widget-part="messages.media-remove"><sp-icon></sp-icon></button>`, 2);
var root_111 = from_html(`<div data-widget-part="messages.media-missing" role="img"><sp-icon></sp-icon> <span data-widget-part="messages.media-missing-text">File no longer available</span></div>`, 2);
var root_210 = from_html(`<button type="button" data-widget-part="messages.media-tile"><img data-widget-part="messages.media-tile-img" loading="lazy" decoding="async"/></button>`);
var root_35 = from_html(`<div data-widget-part="messages.media-item"><!> <!></div>`);
var root_45 = from_html(`<button type="button" data-widget-part="messages.media-more"> </button>`);
var root_55 = from_html(`<div data-widget-part="messages.media-images"><!> <!></div>`);
var root_65 = from_html(`<span data-widget-part="messages.media-file-size"> </span>`);
var root_75 = from_html(`<li data-widget-part="messages.media-item"><a data-widget-part="messages.media-file"><sp-icon></sp-icon> <span data-widget-part="messages.media-file-name"> </span> <!> <sp-icon></sp-icon></a> <!></li>`, 2);
var root_84 = from_html(`<ul data-widget-part="messages.media-files"></ul>`);
var root_94 = from_html(`<div data-widget-part="messages.media-strip" role="group"><!> <!></div>`);
function MessageMediaStrip($$anchor, $$props) {
  push($$props, true);
  const removeButton = ($$anchor2, item = noop) => {
    var fragment = comment();
    var node = first_child(fragment);
    {
      var consequent = ($$anchor3) => {
        var button = root5();
        var sp_icon = child(button);
        set_custom_element_data(sp_icon, "name", "x");
        set_custom_element_data(sp_icon, "size", "14");
        reset(button);
        template_effect(() => {
          set_attribute(button, "aria-label", `Remove ${item().label ?? ""}`);
          set_attribute(button, "title", `Remove ${item().label ?? ""}`);
        });
        delegated("click", button, () => $$props.onRemove?.(item()));
        append($$anchor3, button);
      };
      if_block(node, ($$render) => {
        if (get(removable)) $$render(consequent);
      });
    }
    append($$anchor2, fragment);
  };
  let editing = prop($$props, "editing", 3, false);
  const missing = new SvelteSet();
  const images = user_derived(() => $$props.items.filter((i) => i.kind === "image"));
  const files = user_derived(() => $$props.items.filter((i) => i.kind === "file"));
  const openable = user_derived(() => get(images).filter((i) => !missing.has(i.partId)));
  const folds = user_derived(() => get(images).length > MEDIA_STRIP_MAX_TILES);
  const shown = user_derived(() => get(folds) ? get(images).slice(0, MEDIA_STRIP_MAX_TILES - 1) : get(images));
  const hidden = user_derived(() => get(images).length - get(shown).length);
  const removable = user_derived(() => editing() && !!$$props.onRemove);
  function open(item) {
    const index2 = get(openable).findIndex((i) => i.partId === item.partId);
    if (index2 >= 0) $$props.onOpen?.(get(openable), index2);
  }
  function openFolded() {
    const first = get(images).slice(get(shown).length).find((i) => !missing.has(i.partId));
    if (first) open(first);
  }
  function openLabel(item) {
    const at = get(openable).findIndex((i) => i.partId === item.partId);
    return get(openable).length > 1 ? `Open image ${item.label}, ${at + 1} of ${get(openable).length}` : `Open image ${item.label}`;
  }
  var fragment_1 = comment();
  var node_1 = first_child(fragment_1);
  {
    var consequent_6 = ($$anchor2) => {
      var div_1 = root_94();
      var node_2 = child(div_1);
      {
        var consequent_3 = ($$anchor3) => {
          var div_2 = root_55();
          var node_3 = child(div_2);
          each(node_3, 17, () => get(shown), (item) => item.partId, ($$anchor4, item) => {
            var div_3 = root_35();
            var node_4 = child(div_3);
            {
              var consequent_1 = ($$anchor5) => {
                gone($$anchor5, () => get(item));
              };
              var d = user_derived(() => missing.has(get(item).partId));
              var alternate = ($$anchor5) => {
                var button_1 = root_210();
                var img = child(button_1);
                reset(button_1);
                template_effect(
                  ($0, $1) => {
                    set_attribute(button_1, "aria-label", $0);
                    set_attribute(img, "src", $1);
                    set_attribute(img, "alt", get(item).label);
                  },
                  [
                    () => openLabel(get(item)),
                    () => mediaSrc(get(item).assetId, "thumb")
                  ]
                );
                delegated("click", button_1, () => open(get(item)));
                event("error", img, () => missing.add(get(item).partId));
                replay_events(img);
                append($$anchor5, button_1);
              };
              if_block(node_4, ($$render) => {
                if (get(d)) $$render(consequent_1);
                else $$render(alternate, -1);
              });
            }
            var node_5 = sibling(node_4, 2);
            removeButton(node_5, () => get(item));
            reset(div_3);
            append($$anchor4, div_3);
          });
          var node_6 = sibling(node_3, 2);
          {
            var consequent_2 = ($$anchor4) => {
              var button_2 = root_45();
              var text3 = child(button_2);
              reset(button_2);
              template_effect(() => {
                set_attribute(button_2, "aria-label", `Show ${get(hidden) ?? ""} more ${get(hidden) === 1 ? "image" : "images"}`);
                set_text(text3, `+${get(hidden) ?? ""}`);
              });
              delegated("click", button_2, openFolded);
              append($$anchor4, button_2);
            };
            if_block(node_6, ($$render) => {
              if (get(folds)) $$render(consequent_2);
            });
          }
          reset(div_2);
          append($$anchor3, div_2);
        };
        if_block(node_2, ($$render) => {
          if (get(images).length) $$render(consequent_3);
        });
      }
      var node_7 = sibling(node_2, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var ul = root_84();
          each(ul, 21, () => get(files), (item) => item.partId, ($$anchor4, item) => {
            var li = root_75();
            var a = child(li);
            var sp_icon_2 = child(a);
            template_effect(($0) => set_custom_element_data(sp_icon_2, "name", $0), [() => fileIcon(get(item).mime)]);
            set_custom_element_data(sp_icon_2, "size", "20");
            var span = sibling(sp_icon_2, 2);
            var text_1 = child(span, true);
            reset(span);
            var node_8 = sibling(span, 2);
            {
              var consequent_4 = ($$anchor5) => {
                var span_1 = root_65();
                var text_2 = child(span_1, true);
                reset(span_1);
                template_effect(($0) => set_text(text_2, $0), [() => formatBytes(get(item).bytes)]);
                append($$anchor5, span_1);
              };
              if_block(node_8, ($$render) => {
                if (get(item).bytes) $$render(consequent_4);
              });
            }
            var sp_icon_3 = sibling(node_8, 2);
            set_custom_element_data(sp_icon_3, "name", "download");
            set_custom_element_data(sp_icon_3, "size", "14");
            reset(a);
            var node_9 = sibling(a, 2);
            removeButton(node_9, () => get(item));
            reset(li);
            template_effect(
              ($0, $1) => {
                set_attribute(a, "href", $0);
                set_attribute(a, "download", get(item).name ?? void 0);
                set_attribute(a, "title", get(item).label);
                set_attribute(a, "aria-label", `Download ${get(item).label ?? ""}${$1 ?? ""}`);
                set_text(text_1, get(item).label);
              },
              [
                () => mediaDownloadHref(get(item).assetId),
                () => get(item).bytes ? `, ${formatBytes(get(item).bytes)}` : ""
              ]
            );
            append($$anchor4, li);
          });
          reset(ul);
          append($$anchor3, ul);
        };
        if_block(node_7, ($$render) => {
          if (get(files).length) $$render(consequent_5);
        });
      }
      reset(div_1);
      template_effect(() => {
        set_attribute(div_1, "data-editing", get(removable) ? "" : void 0);
        set_attribute(div_1, "aria-label", $$props.items.length === 1 ? "Attachment" : `${$$props.items.length} attachments`);
      });
      append($$anchor2, div_1);
    };
    if_block(node_1, ($$render) => {
      if ($$props.items.length) $$render(consequent_6);
    });
  }
  append($$anchor, fragment_1);
  pop();
}
delegate(["click"]);

// components/sessions/messages/StateProposalList.svelte
var root6 = from_html(`<div data-widget-part="messages.proposal" data-superseded="true"><sp-icon></sp-icon> <span data-widget-part="messages.proposal-text"> <span data-widget-part="messages.proposal-note"> </span></span></div>`, 2);
var root_113 = from_html(`<span data-widget-part="messages.proposal-anchor"> </span>`);
var root_211 = from_html(`<div data-widget-part="messages.proposal"><sp-icon></sp-icon> <span data-widget-part="messages.proposal-text"> <!></span> <span data-widget-part="messages.proposal-note">proposed</span> <button data-widget-part="messages.proposal-decide messages.proposal-accept">Accept</button> <button data-widget-part="messages.proposal-decide messages.proposal-reject">Reject</button></div>`, 2);
function StateProposalList($$anchor, $$props) {
  push($$props, true);
  let showAnchor = prop($$props, "showAnchor", 3, false);
  const conv = useConversation();
  const t = useT();
  const describe = (row) => row.text;
  const movedName = (row) => row.moved ?? t("a value");
  const decide = (id, accept) => void conv.request("decide-proposal", { proposalId: id, accept });
  var fragment = comment();
  var node = first_child(fragment);
  each(node, 17, () => $$props.proposals, (row) => row.id, ($$anchor2, row) => {
    var fragment_1 = comment();
    var node_1 = first_child(fragment_1);
    {
      var consequent = ($$anchor3) => {
        var div = root6();
        var sp_icon = child(div);
        set_custom_element_data(sp_icon, "name", "history");
        set_custom_element_data(sp_icon, "size", "11");
        var span = sibling(sp_icon, 2);
        var text3 = child(span);
        var span_1 = sibling(text3);
        var text_1 = child(span_1);
        reset(span_1);
        reset(span);
        reset(div);
        template_effect(
          ($0, $1) => {
            set_attribute(div, "data-proposal-id", get(row).id);
            set_text(text3, `${$0 ?? ""} `);
            set_text(text_1, `\xB7 ${$1 ?? ""}`);
          },
          [
            () => describe(get(row)),
            () => t("Superseded \u2014 {slot} changed since this was proposed").replace("{slot}", movedName(get(row)))
          ]
        );
        append($$anchor3, div);
      };
      var alternate = ($$anchor3) => {
        var div_1 = root_211();
        var sp_icon_1 = child(div_1);
        set_custom_element_data(sp_icon_1, "name", "sparkles");
        set_custom_element_data(sp_icon_1, "size", "11");
        var span_2 = sibling(sp_icon_1, 2);
        var text_2 = child(span_2);
        var node_2 = sibling(text_2);
        {
          var consequent_1 = ($$anchor4) => {
            var span_3 = root_113();
            var text_3 = child(span_3);
            reset(span_3);
            template_effect(() => set_text(text_3, `on message ${get(row).messageId ?? ""}`));
            append($$anchor4, span_3);
          };
          if_block(node_2, ($$render) => {
            if (showAnchor() && get(row).messageId != null) $$render(consequent_1);
          });
        }
        reset(span_2);
        var span_4 = sibling(span_2, 2);
        var button = sibling(span_4, 2);
        var button_1 = sibling(button, 2);
        reset(div_1);
        template_effect(
          ($0) => {
            set_attribute(div_1, "data-proposal-id", get(row).id);
            set_text(text_2, `${$0 ?? ""} `);
            set_attribute(span_4, "title", `Proposed by ${(get(row).proposedBy || "a run") ?? ""}`);
          },
          [() => describe(get(row))]
        );
        delegated("click", button, () => decide(get(row).id, true));
        delegated("click", button_1, () => decide(get(row).id, false));
        append($$anchor3, div_1);
      };
      if_block(node_1, ($$render) => {
        if (get(row).status === "superseded") $$render(consequent);
        else $$render(alternate, -1);
      });
    }
    append($$anchor2, fragment_1);
  });
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);

// components/sessions/messages/MessageStateLedger.svelte
var root7 = from_html(`<span data-widget-part="messages.ledger-separator">\xB7</span>`);
var root_114 = from_html(`<!> <span data-widget-part="messages.ledger-change"> </span>`, 1);
var root_212 = from_html(`<p data-widget-part="messages.ledger-line"><span data-widget-part="messages.ledger-owner"> </span> <!></p>`);
var root_36 = from_html(
  `<sp-popover><button slot="trigger" type="button" data-widget-part="messages.ledger-review"><sp-icon></sp-icon> <span> </span></button> <div data-widget-part="messages.ledger-review-panel"><header data-widget-part="messages.ledger-review-title"><sp-icon></sp-icon> <span>Waiting for you</span></header> <p data-widget-part="messages.ledger-review-note">The AI asked for these. Nothing changes until
								you accept one.</p> <!></div></sp-popover>`,
  2
);
var root_46 = from_html(`<div data-widget-part="messages.ledger"><!> <!> <!></div>`);
function MessageStateLedger($$anchor, $$props) {
  push($$props, true);
  const conv = useConversation();
  let groups = user_derived(() => conv.dossier?.state.ledgers[$$props.messageId] ?? []);
  let pending = user_derived(() => conv.dossier?.state.pending[$$props.messageId] ?? []);
  let waiting = user_derived(() => conv.dossier?.state.waiting ?? []);
  let reviewOpen = state(false);
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_3 = ($$anchor2) => {
      var div = root_46();
      var node_1 = child(div);
      each(node_1, 17, () => get(groups), (group) => group.ownerKey, ($$anchor3, group) => {
        var p = root_212();
        var span = child(p);
        var text3 = child(span, true);
        reset(span);
        var node_2 = sibling(span, 2);
        each(node_2, 19, () => get(group).lines, (line) => line.key, ($$anchor4, line, i) => {
          var fragment_1 = root_114();
          var node_3 = first_child(fragment_1);
          {
            var consequent = ($$anchor5) => {
              var span_1 = root7();
              append($$anchor5, span_1);
            };
            if_block(node_3, ($$render) => {
              if (get(i) > 0) $$render(consequent);
            });
          }
          var span_2 = sibling(node_3, 2);
          var text_1 = child(span_2, true);
          reset(span_2);
          template_effect(() => {
            set_attribute(span_2, "title", `changed by ${get(line).updatedBy ?? ""}`);
            set_text(text_1, get(line).text);
          });
          append($$anchor4, fragment_1);
        });
        reset(p);
        template_effect(() => {
          set_attribute(p, "data-owner-key", get(group).ownerKey);
          set_text(text3, get(group).ownerLabel);
        });
        append($$anchor3, p);
      });
      var node_4 = sibling(node_1, 2);
      {
        var consequent_1 = ($$anchor3) => {
          StateProposalList($$anchor3, {
            get proposals() {
              return get(pending);
            }
          });
        };
        if_block(node_4, ($$render) => {
          if (get(pending).length) $$render(consequent_1);
        });
      }
      var node_5 = sibling(node_4, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var sp_popover = root_36();
          set_custom_element_data(sp_popover, "placement", "bottom-start");
          set_custom_element_data(sp_popover, "label", "Waiting for you");
          template_effect(() => set_custom_element_data(sp_popover, "open", get(reviewOpen)));
          var button = child(sp_popover);
          var sp_icon = child(button);
          set_custom_element_data(sp_icon, "name", "clipboard-check");
          set_custom_element_data(sp_icon, "size", "11");
          var span_3 = sibling(sp_icon, 2);
          var text_2 = child(span_3);
          reset(span_3);
          reset(button);
          var div_1 = sibling(button, 2);
          var header = child(div_1);
          var sp_icon_1 = child(header);
          set_custom_element_data(sp_icon_1, "name", "clipboard-check");
          set_custom_element_data(sp_icon_1, "size", "14");
          next(2);
          reset(header);
          var node_6 = sibling(header, 4);
          StateProposalList(node_6, {
            get proposals() {
              return get(waiting);
            },
            showAnchor: true
          });
          reset(div_1);
          reset(sp_popover);
          template_effect(() => set_text(text_2, `Review
						${get(waiting).length === 1 ? "1 change" : `${get(waiting).length} changes`}`));
          event("open-change", sp_popover, (e) => set(reviewOpen, e.detail.open, true));
          append($$anchor3, sp_popover);
        };
        if_block(node_5, ($$render) => {
          if (get(waiting).length) $$render(consequent_2);
        });
      }
      reset(div);
      template_effect(() => set_attribute(div, "data-ledger-message", $$props.messageId));
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if (get(groups).length || get(pending).length) $$render(consequent_3);
    });
  }
  append($$anchor, fragment);
  pop();
}

// components/sessions/messages/SessionMessage.svelte
var root8 = from_html(`<span data-widget-part="messages.message-avatar-glyph" aria-hidden="true"><sp-icon></sp-icon></span>`, 2);
var root_115 = from_html(`<img data-widget-part="messages.message-avatar-img"/>`);
var root_213 = from_html(`<span data-widget-part="messages.message-avatar-glyph" aria-hidden="true"> </span>`);
var root_37 = from_html(`<button data-widget-part="messages.message-avatar-button"><!></button>`);
var root_47 = from_html(`<span data-widget-part="messages.message-name"> </span>`);
var root_56 = from_html(`<button data-widget-part="messages.message-name"> </button>`);
var root_66 = from_html(`<span data-widget-part="messages.message-member"> </span>`);
var root_76 = from_html(`<span data-widget-part="messages.message-badge" role="img" aria-label="Greeting message"><sp-icon></sp-icon></span>`, 2);
var root_85 = from_html(`<span data-widget-part="messages.message-badge" role="img" aria-label="Hidden from the model"><sp-icon></sp-icon></span>`, 2);
var root_95 = from_html(`<span data-widget-part="messages.message-badge messages.message-badge-scene"><sp-icon></sp-icon> <span data-widget-part="messages.message-badge-label">In scene:</span> <span data-widget-part="messages.message-badge-text"> </span></span>`, 2);
var root_103 = from_html(`<span data-widget-part="messages.message-vectors" data-vectors="current" title="Vectors up to date" aria-label="Vectors up to date"><sp-icon></sp-icon></span>`, 2);
var root_116 = from_html(`<span data-widget-part="messages.message-vectors" data-vectors="stale" title="Vectors stale \u2014 model changed" aria-label="Vectors stale \u2014 model changed"><sp-icon></sp-icon></span>`, 2);
var root_123 = from_html(`<span data-widget-part="messages.message-status"><span data-widget-part="messages.message-ember" aria-hidden="true"></span> </span>`);
var root_133 = from_html(`<span data-widget-part="messages.message-status">Editing</span>`);
var root_143 = from_html(`<span data-widget-part="messages.message-status" title="This reply was stopped before it finished">Stopped</span>`);
var root_153 = from_html(`<button data-widget-part="messages.message-cancel" title="Cancel edit (Esc)">Cancel</button> <button data-widget-part="messages.message-save">Save</button>`, 1);
var root_163 = from_html(`<span data-widget-part="messages.message-time"> </span>`);
var root_173 = from_html(`<button data-widget-part="messages.message-swipe-previous messages.message-icon-button" aria-label="Previous swipe"><sp-icon></sp-icon></button> <span data-widget-part="messages.message-swipe-count" aria-live="polite"> </span>`, 3);
var root_182 = from_html(`<div data-widget-part="messages.message-swipes"><!> <button data-widget-part="messages.message-swipe-next messages.message-icon-button" aria-label="Next swipe"><sp-icon></sp-icon></button></div>`, 2);
var root_192 = from_html(`<button data-widget-part="messages.message-action messages.message-icon-button"><sp-icon></sp-icon></button>`, 2);
var root_202 = from_html(`<div data-widget-part="messages.message-actions" role="group" aria-label="Message actions"></div>`);
var root_214 = from_html(`<span data-widget-part="messages.message-in-scene messages.message-selection-button" title="Already captured in a scene" aria-label="Already captured in a scene"><sp-icon></sp-icon> <span data-widget-part="messages.message-selection-label">In Scene</span></span>`, 2);
var root_223 = from_html(`<button data-widget-part="messages.message-select messages.message-selection-button"><sp-icon></sp-icon> <span data-widget-part="messages.message-selection-label"> </span></button> <button data-widget-part="messages.message-select-above messages.message-selection-button" title="Select all above up to nearest selected" aria-label="Select all above up to nearest selected"><sp-icon></sp-icon> <span data-widget-part="messages.message-selection-label">Select all above</span></button> <button data-widget-part="messages.message-select-below messages.message-selection-button" title="Select all below up to nearest selected" aria-label="Select all below up to nearest selected"><sp-icon></sp-icon> <span data-widget-part="messages.message-selection-label">Select all below</span></button>`, 3);
var root_233 = from_html(`<div data-widget-part="messages.message-selection" role="group" aria-label="Selection controls"><!></div>`);
var root_242 = from_html(`<button data-widget-part="messages.message-stop"><sp-icon></sp-icon> Stop</button>`, 2);
var root_252 = from_html(`<!> <!> <!> <div data-widget-part="messages.message-menu"><!></div> <!>`, 1);
var root_262 = from_html(`<div data-widget-part="messages.message-disclosure"><button data-widget-part="messages.message-disclosure-toggle"><sp-icon></sp-icon> <span>Extra instructions</span> <sp-icon></sp-icon></button> <div data-widget-part="messages.message-disclosure-track"><div data-widget-part="messages.message-disclosure-clip"><div data-widget-part="messages.message-disclosure-panel messages.prose"><sp-message-body></sp-message-body></div></div></div></div>`, 2);
var root_272 = from_html(`<li> </li>`);
var root_282 = from_html(`<ul data-widget-part="messages.fold-list"></ul>`);
var root_292 = from_html(`<sp-message-body></sp-message-body>`, 2);
var root_30 = from_html(`<div data-widget-part="messages.message-disclosure"><button type="button" data-widget-part="messages.message-disclosure-toggle"><sp-icon></sp-icon> <span> </span> <sp-icon></sp-icon></button> <div data-widget-part="messages.message-disclosure-track"><div data-widget-part="messages.message-disclosure-clip"><div data-widget-part="messages.message-disclosure-panel messages.prose"><!></div></div></div></div>`, 2);
var root_31 = from_html(`<div data-widget-part="messages.message-disclosure"><button data-widget-part="messages.message-disclosure-toggle"><sp-icon></sp-icon> <span>Reasoning</span> <sp-icon></sp-icon></button> <div data-widget-part="messages.message-disclosure-track"><div data-widget-part="messages.message-disclosure-clip"><div data-widget-part="messages.message-disclosure-panel messages.prose"><sp-message-body></sp-message-body></div></div></div></div>`, 2);
var root_322 = from_html(`<div data-widget-part="messages.message-disclosures"><!> <!> <!></div>`);
var root_332 = from_html(`<div data-widget-part="messages.message-partial messages.prose"><sp-message-body></sp-message-body></div>`, 2);
var root_342 = from_html(`<p data-widget-part="messages.message-error-detail"> </p>`);
var root_352 = from_html(`<div data-widget-part="messages.message-failure"><!> <div data-widget-part="messages.message-error"><p data-widget-part="messages.message-error-line"><sp-icon></sp-icon> <span> <!></span></p> <!> <button data-widget-part="messages.message-retry">Retry</button></div></div>`, 2);
var root_362 = from_html(`<span data-widget-part="messages.edit-unsaved">Unsaved changes</span>`);
var root_372 = from_html(`<div data-widget-part="messages.edit-surface"><!> <div data-widget-part="messages.edit-hint"><span><kbd data-widget-part="messages.edit-key">Ctrl</kbd> + <kbd data-widget-part="messages.edit-key">Enter</kbd> to save</span> <span aria-hidden="true" data-widget-part="messages.edit-hint-separator">\xB7</span> <span><kbd data-widget-part="messages.edit-key">Esc</kbd> to cancel</span> <!></div></div>`);
var root_38 = from_html(`<div data-widget-part="messages.message-parts"><!></div>`);
var root_39 = from_html(`<div data-widget-part="messages.message-text messages.prose"><sp-message-body></sp-message-body></div>`, 2);
var root_40 = from_html(`<div data-widget-part="messages.message" tabindex="-1" role="article"><span data-widget-part="messages.message-avatar"><!></span> <div data-widget-part="messages.message-identity"><!> <!> <span data-widget-part="messages.message-badges"><!> <!> <!> <!></span> <!></div> <div data-widget-part="messages.message-controls"><!></div> <div data-widget-part="messages.message-content"><!> <div data-widget-part="messages.message-sizer"><div data-widget-part="messages.message-body"><!></div></div> <!></div> <!></div>`);
function SessionMessage($$anchor, $$props) {
  push($$props, true);
  let sceneName = prop($$props, "sceneName", 3, null);
  const conv = useConversation();
  const line = user_derived(() => conv.line($$props.msg.id));
  const allMessages = user_derived(() => conv.ctx.messages.v1);
  const hasGeneratingMessage = user_derived(() => get(allMessages).some((m) => m.isGenerating));
  const extendRefusal = user_derived(() => conv.dossier?.extendRefusal);
  const isSummarizationMode = user_derived(() => conv.select.active);
  const isSelected = user_derived(() => conv.select.ids.has($$props.msg.id));
  const scened = user_derived(() => conv.dossier?.scened.includes($$props.msg.id) ?? false);
  const widget = useWidgetContext();
  const ctx = user_derived(() => widget?.current);
  function fireOfferedAction(action, m) {
    conv.invoke(actionIdentity(action), m);
  }
  function fireBlockAction(fn, m, payload, action, blockId) {
    conv.ctx.action(fn, m.id, payload, action, blockId);
  }
  const messageCount = user_derived(() => get(allMessages).length);
  let showLineSprite = user_derived(() => get(ctx)?.settings?.v1?.avatarFace === "sprite");
  let faceSrc = user_derived(() => get(showLineSprite) ? get(line).speaker.sprite ?? get(line).speaker.face : get(line).speaker.face);
  const narratorDisplayName = user_derived(() => $$props.msg.metadata?.narratorName || "Narrator");
  const displayName = user_derived(() => $$props.msg.isNarratorResponse ? get(narratorDisplayName) : get(line).speaker.name);
  const speakerMember = user_derived(() => $$props.msg.isNarratorResponse ? void 0 : get(line).speaker.member?.trim() || void 0);
  const avatarInitial = user_derived(() => get(displayName).trim().charAt(0).toUpperCase() || "?");
  const isGreeting = user_derived(() => !!$$props.msg.metadata?.isGreeting);
  const msgRole = user_derived(() => $$props.msg.isNarratorResponse ? "narration" : $$props.msg.role === "user" ? "user" : "assistant");
  const isEnvoy = user_derived(() => messageEnvoySlug($$props.msg) !== null);
  const msgAuthor = user_derived(() => $$props.msg.isNarratorResponse ? "narrator" : $$props.msg.personaId != null ? "persona" : $$props.msg.characterId != null ? "character" : get(isEnvoy) ? "envoy" : "unknown");
  const canControl = user_derived(() => get(line).controllable);
  const showSwipes = user_derived(() => get(line).swipes.show);
  const swipeWhen = user_derived(() => {
    const listed = [
      ...get(venueActions)?.primary ?? [],
      ...get(venueActions)?.overflow ?? []
    ].find((a) => a.specSlug === "core" && a.key === "swipe");
    if (!listed) return [false, void 0];
    return enabledWhenState({
      msg: $$props.msg,
      isLastMessage: $$props.isLastMessage,
      canControl: get(canControl),
      ...verdictOf(listed)
    });
  });
  const reasoningContent = user_derived(() => $$props.msg.metadata?.reasoning || "");
  const hasReasoning = user_derived(() => get(reasoningContent).trim().length > 0);
  const narratorInstructionsContent = user_derived(() => $$props.msg.metadata?.narratorInstructions || "");
  const hasNarratorInstructions = user_derived(() => get(narratorInstructionsContent).trim().length > 0);
  let isReasoningExpanded = state(false);
  let isNarratorInstructionsExpanded = state(false);
  const foldedSections = user_derived(() => foldedSectionsOf($$props.msg.metadata));
  let expandedSections = proxy({});
  const isEditing = user_derived(() => conv.edit.id === $$props.msg.id);
  let editContent = state("");
  user_effect(() => {
    if (get(isEditing)) set(editContent, untrack(() => $$props.msg.content), true);
  });
  const partsNative = user_derived(() => !!$$props.msg.parts?.length && !$$props.msg.isGenerating && !$$props.msg.error && !get(isEditing));
  const isEditDirty = user_derived(() => get(isEditing) && get(editContent) !== $$props.msg.content);
  const canSaveEdit = user_derived(() => get(isEditDirty) && get(editContent).trim().length > 0);
  const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const messageTime = user_derived(() => {
    const created = $$props.msg.createdAt;
    const stamp = typeof created === "string" && DAY_ONLY.test(created) ? $$props.msg.updatedAt ?? created : created ?? $$props.msg.updatedAt;
    if (!stamp) return "";
    const at = stamp instanceof Date ? stamp : new Date(stamp);
    if (Number.isNaN(at.getTime())) return "";
    return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  });
  const generatingStatus = user_derived(() => conv.statusText($$props.msg.generationStatus) || conv.t("working"));
  const venueActions = user_derived(() => get(ctx)?.actions?.v1?.message);
  const quickActions = user_derived(() => quickRowActions(get(venueActions)?.primary ?? [], {
    msg: $$props.msg,
    isLastMessage: $$props.isLastMessage,
    editing: conv.edit.id !== null,
    hasGeneratingMessage: get(hasGeneratingMessage),
    canControl: get(canControl),
    extendRefusal: get(extendRefusal)
  }));
  const showQuickActions = user_derived(() => !get(isSummarizationMode) && !get(isEditing) && get(quickActions).length > 0);
  function fireQuick(_e, action) {
    if (action.specSlug !== "core") return fireOfferedAction(action, $$props.msg);
    if (action.key === "edit") return conv.edit.start($$props.msg);
    if (action.key === "swipe") return conv.swipe($$props.msg, "right");
    conv.invoke(action.key, $$props.msg);
  }
  const swipes = user_derived(() => $$props.msg.metadata?.swipes);
  const hasSwipeHistory = user_derived(() => get(swipes)?.currentIdx !== null && get(swipes)?.currentIdx !== void 0 && !!get(swipes)?.history && get(swipes).history.length > 1);
  function handleMessageUpdate() {
    if (!get(canSaveEdit)) return;
    conv.edit.save($$props.msg, get(editContent));
  }
  function toggleReasoning() {
    set(isReasoningExpanded, !get(isReasoningExpanded));
  }
  function toggleNarratorInstructions() {
    set(isNarratorInstructionsExpanded, !get(isNarratorInstructionsExpanded));
  }
  const mediaItems = user_derived(() => mediaStripItems($$props.msg.parts, $$props.msg.activeRevisions ?? { "0": 0 }));
  const openImage = (e) => void conv.request("view-image", { src: e.detail.src });
  var div = root_40();
  var span = child(div);
  var node = child(span);
  {
    var consequent = ($$anchor2) => {
      var span_1 = root8();
      var sp_icon = child(span_1);
      set_custom_element_data(sp_icon, "name", "cloud-sun");
      set_custom_element_data(sp_icon, "size", "1.25em");
      reset(span_1);
      template_effect(() => set_attribute(span_1, "title", get(narratorDisplayName)));
      append($$anchor2, span_1);
    };
    var alternate_1 = ($$anchor2) => {
      var button = root_37();
      var node_1 = child(button);
      {
        var consequent_1 = ($$anchor3) => {
          var img = root_115();
          template_effect(() => {
            set_attribute(img, "src", get(faceSrc));
            set_attribute(img, "alt", get(displayName));
          });
          append($$anchor3, img);
        };
        var alternate = ($$anchor3) => {
          var span_2 = root_213();
          var text3 = child(span_2, true);
          reset(span_2);
          template_effect(() => set_text(text3, get(avatarInitial)));
          append($$anchor3, span_2);
        };
        if_block(node_1, ($$render) => {
          if (get(faceSrc)) $$render(consequent_1);
          else $$render(alternate, -1);
        });
      }
      reset(button);
      template_effect(() => set_attribute(button, "aria-label", `View ${get(displayName) ?? ""}'s avatar`));
      delegated("click", button, () => get(line).speaker.ref && void conv.request("view-avatar", { ref: get(line).speaker.ref }));
      append($$anchor2, button);
    };
    if_block(node, ($$render) => {
      if ($$props.msg.isNarratorResponse) $$render(consequent);
      else $$render(alternate_1, -1);
    });
  }
  reset(span);
  var div_1 = sibling(span, 2);
  var node_2 = child(div_1);
  {
    var consequent_2 = ($$anchor2) => {
      var span_3 = root_47();
      var text_1 = child(span_3, true);
      reset(span_3);
      template_effect(() => {
        set_attribute(span_3, "title", get(narratorDisplayName));
        set_text(text_1, get(narratorDisplayName));
      });
      append($$anchor2, span_3);
    };
    var consequent_3 = ($$anchor2) => {
      var span_4 = root_47();
      var text_2 = child(span_4, true);
      reset(span_4);
      template_effect(() => {
        set_attribute(span_4, "title", get(displayName));
        set_text(text_2, get(displayName));
      });
      append($$anchor2, span_4);
    };
    var alternate_2 = ($$anchor2) => {
      var button_1 = root_56();
      var text_3 = child(button_1, true);
      reset(button_1);
      template_effect(() => {
        set_attribute(button_1, "title", get(displayName));
        set_text(text_3, get(displayName));
      });
      delegated("click", button_1, () => {
        const id = $$props.msg.characterId ?? $$props.msg.personaId;
        if (id) void conv.request("open-character", { characterId: id });
      });
      append($$anchor2, button_1);
    };
    if_block(node_2, ($$render) => {
      if ($$props.msg.isNarratorResponse) $$render(consequent_2);
      else if (get(isEnvoy)) $$render(consequent_3, 1);
      else $$render(alternate_2, -1);
    });
  }
  var node_3 = sibling(node_2, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var span_5 = root_66();
      var text_4 = child(span_5);
      reset(span_5);
      template_effect(() => set_text(text_4, `\xB7 ${get(speakerMember) ?? ""}`));
      append($$anchor2, span_5);
    };
    if_block(node_3, ($$render) => {
      if (get(speakerMember)) $$render(consequent_4);
    });
  }
  var span_6 = sibling(node_3, 2);
  var node_4 = child(span_6);
  {
    var consequent_5 = ($$anchor2) => {
      var span_7 = root_76();
      var sp_icon_1 = child(span_7);
      set_custom_element_data(sp_icon_1, "name", "handshake");
      set_custom_element_data(sp_icon_1, "size", "14");
      reset(span_7);
      append($$anchor2, span_7);
    };
    if_block(node_4, ($$render) => {
      if (get(isGreeting)) $$render(consequent_5);
    });
  }
  var node_5 = sibling(node_4, 2);
  {
    var consequent_6 = ($$anchor2) => {
      var span_8 = root_85();
      var sp_icon_2 = child(span_8);
      set_custom_element_data(sp_icon_2, "name", "ghost");
      set_custom_element_data(sp_icon_2, "size", "14");
      reset(span_8);
      append($$anchor2, span_8);
    };
    if_block(node_5, ($$render) => {
      if ($$props.msg.isHidden) $$render(consequent_6);
    });
  }
  var node_6 = sibling(node_5, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var span_9 = root_95();
      var sp_icon_3 = child(span_9);
      set_custom_element_data(sp_icon_3, "name", "film");
      set_custom_element_data(sp_icon_3, "size", "14");
      var span_10 = sibling(sp_icon_3, 4);
      var text_5 = child(span_10, true);
      reset(span_10);
      reset(span_9);
      template_effect(() => set_text(text_5, sceneName()));
      append($$anchor2, span_9);
    };
    if_block(node_6, ($$render) => {
      if (sceneName()) $$render(consequent_7);
    });
  }
  var node_7 = sibling(node_6, 2);
  {
    var consequent_8 = ($$anchor2) => {
      var span_11 = root_103();
      var sp_icon_4 = child(span_11);
      set_custom_element_data(sp_icon_4, "name", "zap");
      set_custom_element_data(sp_icon_4, "size", "12");
      reset(span_11);
      append($$anchor2, span_11);
    };
    var consequent_9 = ($$anchor2) => {
      var span_12 = root_116();
      var sp_icon_5 = child(span_12);
      set_custom_element_data(sp_icon_5, "name", "refresh-cw");
      set_custom_element_data(sp_icon_5, "size", "12");
      reset(span_12);
      append($$anchor2, span_12);
    };
    if_block(node_7, ($$render) => {
      if (get(line).embedding === "current") $$render(consequent_8);
      else if (get(line).embedding === "stale") $$render(consequent_9, 1);
    });
  }
  reset(span_6);
  var node_8 = sibling(span_6, 2);
  {
    var consequent_10 = ($$anchor2) => {
      var span_13 = root_123();
      var text_6 = sibling(child(span_13));
      reset(span_13);
      template_effect(() => set_text(text_6, ` ${get(generatingStatus) ?? ""}`));
      append($$anchor2, span_13);
    };
    var consequent_11 = ($$anchor2) => {
      var span_14 = root_133();
      append($$anchor2, span_14);
    };
    var consequent_12 = ($$anchor2) => {
      var span_15 = root_143();
      append($$anchor2, span_15);
    };
    if_block(node_8, ($$render) => {
      if ($$props.msg.isGenerating) $$render(consequent_10);
      else if (get(isEditing)) $$render(consequent_11, 1);
      else if ($$props.msg.generationOutcome === "stopped") $$render(consequent_12, 2);
    });
  }
  reset(div_1);
  var div_2 = sibling(div_1, 2);
  var node_9 = child(div_2);
  {
    var consequent_13 = ($$anchor2) => {
      var fragment = root_153();
      var button_2 = first_child(fragment);
      var button_3 = sibling(button_2, 2);
      template_effect(() => {
        set_attribute(button_3, "title", get(canSaveEdit) ? "Save changes (Ctrl+Enter)" : get(isEditDirty) ? "A message can't be saved empty" : "No changes to save");
        button_3.disabled = !get(canSaveEdit);
      });
      delegated("click", button_2, () => conv.edit.cancel());
      delegated("click", button_3, handleMessageUpdate);
      append($$anchor2, fragment);
    };
    var alternate_5 = ($$anchor2) => {
      var fragment_1 = root_252();
      var node_10 = first_child(fragment_1);
      {
        var consequent_14 = ($$anchor3) => {
          var span_16 = root_163();
          var text_7 = child(span_16, true);
          reset(span_16);
          template_effect(() => set_text(text_7, get(messageTime)));
          append($$anchor3, span_16);
        };
        if_block(node_10, ($$render) => {
          if (get(messageTime)) $$render(consequent_14);
        });
      }
      var node_11 = sibling(node_10, 2);
      {
        var consequent_16 = ($$anchor3) => {
          var div_3 = root_182();
          var node_12 = child(div_3);
          {
            var consequent_15 = ($$anchor4) => {
              var fragment_2 = root_173();
              var button_4 = first_child(fragment_2);
              var sp_icon_6 = child(button_4);
              set_custom_element_data(sp_icon_6, "name", "chevron-left");
              set_custom_element_data(sp_icon_6, "size", "14");
              reset(button_4);
              var span_17 = sibling(button_4, 2);
              var text_8 = child(span_17);
              reset(span_17);
              template_effect(() => {
                button_4.disabled = conv.edit.id !== null || !get(swipes).currentIdx || get(swipes).history.length <= 1 || $$props.msg.isGenerating || !get(canControl);
                set_text(text_8, `${(get(swipes).currentIdx || 0) + 1} / ${get(swipes).history.length ?? ""}`);
              });
              delegated("click", button_4, () => conv.swipe($$props.msg, "left"));
              append($$anchor4, fragment_2);
            };
            if_block(node_12, ($$render) => {
              if (get(hasSwipeHistory)) $$render(consequent_15);
            });
          }
          var button_5 = sibling(node_12, 2);
          var sp_icon_7 = child(button_5);
          set_custom_element_data(sp_icon_7, "name", "chevron-right");
          set_custom_element_data(sp_icon_7, "size", "14");
          reset(button_5);
          reset(div_3);
          template_effect(() => {
            set_attribute(button_5, "title", get(swipeWhen)[1] ? `Next swipe \u2014 ${get(swipeWhen)[1]}` : void 0);
            button_5.disabled = conv.edit.id !== null || get(swipeWhen)[0] || !get(canControl);
          });
          delegated("click", button_5, () => conv.swipe($$props.msg, "right"));
          append($$anchor3, div_3);
        };
        if_block(node_11, ($$render) => {
          if (get(showSwipes)) $$render(consequent_16);
        });
      }
      var node_13 = sibling(node_11, 2);
      {
        var consequent_17 = ($$anchor3) => {
          var div_4 = root_202();
          each(div_4, 21, () => get(quickActions), ({ action }) => actionIdentity(action), ($$anchor4, $$item) => {
            let action = () => get($$item).action;
            const iconName = user_derived(() => action().icon || "play");
            var button_6 = root_192();
            var sp_icon_8 = child(button_6);
            template_effect(() => set_custom_element_data(sp_icon_8, "name", get(iconName)));
            set_custom_element_data(sp_icon_8, "size", "14");
            reset(button_6);
            template_effect(() => {
              set_attribute(button_6, "aria-label", action().iconAlt || action().name);
              set_attribute(button_6, "title", action().description ? `${action().name} \u2014 ${action().description}` : action().name);
            });
            delegated("click", button_6, (e) => fireQuick(e, action()));
            append($$anchor4, button_6);
          });
          reset(div_4);
          append($$anchor3, div_4);
        };
        if_block(node_13, ($$render) => {
          if (get(showQuickActions)) $$render(consequent_17);
        });
      }
      var div_5 = sibling(node_13, 2);
      var node_14 = child(div_5);
      {
        var consequent_19 = ($$anchor3) => {
          var div_6 = root_233();
          var node_15 = child(div_6);
          {
            var consequent_18 = ($$anchor4) => {
              var span_18 = root_214();
              var sp_icon_9 = child(span_18);
              set_custom_element_data(sp_icon_9, "name", "film");
              next(2);
              reset(span_18);
              append($$anchor4, span_18);
            };
            var alternate_3 = ($$anchor4) => {
              var fragment_3 = root_223();
              var button_7 = first_child(fragment_3);
              var sp_icon_10 = child(button_7);
              template_effect(() => set_custom_element_data(sp_icon_10, "name", get(isSelected) ? "check-square" : "square"));
              var span_19 = sibling(sp_icon_10, 2);
              var text_9 = child(span_19, true);
              reset(span_19);
              reset(button_7);
              var button_8 = sibling(button_7, 2);
              var sp_icon_11 = child(button_8);
              set_custom_element_data(sp_icon_11, "name", "chevrons-up");
              next(2);
              reset(button_8);
              var button_9 = sibling(button_8, 2);
              var sp_icon_12 = child(button_9);
              set_custom_element_data(sp_icon_12, "name", "chevrons-down");
              next(2);
              reset(button_9);
              template_effect(() => {
                set_attribute(button_7, "title", get(isSelected) ? "Deselect message" : "Select message");
                set_attribute(button_7, "aria-label", get(isSelected) ? "Deselect message" : "Select message");
                set_attribute(button_7, "aria-pressed", get(isSelected));
                set_text(text_9, get(isSelected) ? "Deselect" : "Select");
              });
              delegated("click", button_7, () => conv.select.toggle($$props.msg));
              delegated("click", button_8, () => conv.select.range($$props.index, "above"));
              delegated("click", button_9, () => conv.select.range($$props.index, "below"));
              append($$anchor4, fragment_3);
            };
            if_block(node_15, ($$render) => {
              if (get(scened)) $$render(consequent_18);
              else $$render(alternate_3, -1);
            });
          }
          reset(div_6);
          append($$anchor3, div_6);
        };
        var alternate_4 = ($$anchor3) => {
          MessageControls($$anchor3, {
            get msg() {
              return $$props.msg;
            },
            get isLastMessage() {
              return $$props.isLastMessage;
            }
          });
        };
        if_block(node_14, ($$render) => {
          if (get(isSummarizationMode)) $$render(consequent_19);
          else $$render(alternate_4, -1);
        });
      }
      reset(div_5);
      var node_16 = sibling(div_5, 2);
      {
        var consequent_20 = ($$anchor3) => {
          var button_10 = root_242();
          var sp_icon_13 = child(button_10);
          set_custom_element_data(sp_icon_13, "name", "square");
          set_custom_element_data(sp_icon_13, "size", "14");
          next();
          reset(button_10);
          delegated("click", button_10, () => conv.invoke("stop", $$props.msg));
          append($$anchor3, button_10);
        };
        if_block(node_16, ($$render) => {
          if ($$props.msg.isGenerating) $$render(consequent_20);
        });
      }
      append($$anchor2, fragment_1);
    };
    if_block(node_9, ($$render) => {
      if (get(isEditing)) $$render(consequent_13);
      else $$render(alternate_5, -1);
    });
  }
  reset(div_2);
  var div_7 = sibling(div_2, 2);
  var node_17 = child(div_7);
  {
    var consequent_24 = ($$anchor2) => {
      var div_8 = root_322();
      var node_18 = child(div_8);
      {
        var consequent_21 = ($$anchor3) => {
          var div_9 = root_262();
          var button_11 = child(div_9);
          var sp_icon_14 = child(button_11);
          set_custom_element_data(sp_icon_14, "name", "target");
          set_custom_element_data(sp_icon_14, "size", "14");
          var sp_icon_15 = sibling(sp_icon_14, 4);
          set_custom_element_data(sp_icon_15, "name", "chevron-down");
          set_custom_element_data(sp_icon_15, "size", "14");
          reset(button_11);
          var div_10 = sibling(button_11, 2);
          var div_11 = child(div_10);
          var div_12 = child(div_11);
          var sp_message_body = child(div_12);
          template_effect(() => set_custom_element_data(sp_message_body, "text", get(narratorInstructionsContent)));
          reset(div_12);
          reset(div_11);
          reset(div_10);
          reset(div_9);
          template_effect(() => {
            set_attribute(button_11, "aria-expanded", get(isNarratorInstructionsExpanded));
            set_attribute(button_11, "aria-controls", `extra-instructions-${$$props.msg.id ?? ""}`);
            set_attribute(div_10, "id", `extra-instructions-${$$props.msg.id ?? ""}`);
            set_attribute(div_10, "data-expanded", get(isNarratorInstructionsExpanded) ? "" : void 0);
          });
          delegated("click", button_11, toggleNarratorInstructions);
          append($$anchor3, div_9);
        };
        if_block(node_18, ($$render) => {
          if (get(hasNarratorInstructions)) $$render(consequent_21);
        });
      }
      var node_19 = sibling(node_18, 2);
      each(node_19, 17, () => get(foldedSections), index, ($$anchor3, section, i) => {
        var div_13 = root_30();
        var button_12 = child(div_13);
        var sp_icon_16 = child(button_12);
        template_effect(() => set_custom_element_data(sp_icon_16, "name", get(section).kind === "reasoning" ? "brain-circuit" : "notebook-pen"));
        set_custom_element_data(sp_icon_16, "size", "14");
        var span_20 = sibling(sp_icon_16, 2);
        var text_10 = child(span_20, true);
        reset(span_20);
        var sp_icon_17 = sibling(span_20, 2);
        set_custom_element_data(sp_icon_17, "name", "chevron-down");
        set_custom_element_data(sp_icon_17, "size", "14");
        reset(button_12);
        var div_14 = sibling(button_12, 2);
        var div_15 = child(div_14);
        var div_16 = child(div_15);
        var node_20 = child(div_16);
        {
          var consequent_22 = ($$anchor4) => {
            var ul = root_282();
            each(ul, 21, () => get(section).items, index, ($$anchor5, item) => {
              var li = root_272();
              var text_11 = child(li, true);
              reset(li);
              template_effect(() => set_text(text_11, get(item)));
              append($$anchor5, li);
            });
            reset(ul);
            append($$anchor4, ul);
          };
          var alternate_6 = ($$anchor4) => {
            var sp_message_body_1 = root_292();
            template_effect(() => set_custom_element_data(sp_message_body_1, "text", get(section).content ?? ""));
            append($$anchor4, sp_message_body_1);
          };
          if_block(node_20, ($$render) => {
            if (get(section).items) $$render(consequent_22);
            else $$render(alternate_6, -1);
          });
        }
        reset(div_16);
        reset(div_15);
        reset(div_14);
        reset(div_13);
        template_effect(() => {
          set_attribute(button_12, "aria-expanded", !!expandedSections[i]);
          set_attribute(button_12, "aria-controls", `folded-section-${$$props.msg.id ?? ""}-${i}`);
          set_text(text_10, get(section).label);
          set_attribute(div_14, "id", `folded-section-${$$props.msg.id ?? ""}-${i}`);
          set_attribute(div_14, "data-expanded", expandedSections[i] ? "" : void 0);
        });
        delegated("click", button_12, () => expandedSections[i] = !expandedSections[i]);
        append($$anchor3, div_13);
      });
      var node_21 = sibling(node_19, 2);
      {
        var consequent_23 = ($$anchor3) => {
          var div_17 = root_31();
          var button_13 = child(div_17);
          var sp_icon_18 = child(button_13);
          set_custom_element_data(sp_icon_18, "name", "brain-circuit");
          set_custom_element_data(sp_icon_18, "size", "14");
          var sp_icon_19 = sibling(sp_icon_18, 4);
          set_custom_element_data(sp_icon_19, "name", "chevron-down");
          set_custom_element_data(sp_icon_19, "size", "14");
          reset(button_13);
          var div_18 = sibling(button_13, 2);
          var div_19 = child(div_18);
          var div_20 = child(div_19);
          var sp_message_body_2 = child(div_20);
          template_effect(() => set_custom_element_data(sp_message_body_2, "text", get(reasoningContent)));
          reset(div_20);
          reset(div_19);
          reset(div_18);
          reset(div_17);
          template_effect(() => {
            set_attribute(button_13, "aria-expanded", get(isReasoningExpanded));
            set_attribute(button_13, "aria-controls", `reasoning-${$$props.msg.id ?? ""}`);
            set_attribute(div_18, "id", `reasoning-${$$props.msg.id ?? ""}`);
            set_attribute(div_18, "data-expanded", get(isReasoningExpanded) ? "" : void 0);
          });
          delegated("click", button_13, toggleReasoning);
          append($$anchor3, div_17);
        };
        if_block(node_21, ($$render) => {
          if (get(hasReasoning)) $$render(consequent_23);
        });
      }
      reset(div_8);
      append($$anchor2, div_8);
    };
    if_block(node_17, ($$render) => {
      if ((get(hasNarratorInstructions) || get(hasReasoning) || get(foldedSections).length) && !get(partsNative)) $$render(consequent_24);
    });
  }
  var div_21 = sibling(node_17, 2);
  var div_22 = child(div_21);
  var node_22 = child(div_22);
  {
    var consequent_28 = ($$anchor2) => {
      var div_23 = root_352();
      var node_23 = child(div_23);
      {
        var consequent_25 = ($$anchor3) => {
          var div_24 = root_332();
          var sp_message_body_3 = child(div_24);
          template_effect(() => set_custom_element_data(sp_message_body_3, "text", $$props.msg.content));
          reset(div_24);
          append($$anchor3, div_24);
        };
        if_block(node_23, ($$render) => {
          if ($$props.msg.content) $$render(consequent_25);
        });
      }
      var div_25 = sibling(node_23, 2);
      var p = child(div_25);
      var sp_icon_20 = child(p);
      set_custom_element_data(sp_icon_20, "name", "alert-triangle");
      set_custom_element_data(sp_icon_20, "size", "14");
      set_custom_element_data(sp_icon_20, "data-widget-part", "messages.message-error-icon");
      var span_21 = sibling(sp_icon_20, 2);
      var text_12 = child(span_21, true);
      var node_24 = sibling(text_12);
      {
        var consequent_26 = ($$anchor3) => {
          var text_13 = text();
          template_effect(() => set_text(text_13, `(${$$props.msg.error.code ?? ""})`));
          append($$anchor3, text_13);
        };
        if_block(node_24, ($$render) => {
          if ($$props.msg.error.code) $$render(consequent_26);
        });
      }
      reset(span_21);
      reset(p);
      var node_25 = sibling(p, 2);
      {
        var consequent_27 = ($$anchor3) => {
          var p_1 = root_342();
          var text_14 = child(p_1);
          reset(p_1);
          template_effect(
            ($0) => set_text(text_14, `${$0 ?? ""}${$$props.msg.error.connection.detail ? `${$$props.msg.error.connection.name ? "\n" : ""}${$$props.msg.error.connection.detail}` : ""}`),
            [
              () => [
                $$props.msg.error.connection.name,
                $$props.msg.error.connection.model
              ].filter(Boolean).join(" \xB7 ")
            ]
          );
          append($$anchor3, p_1);
        };
        if_block(node_25, ($$render) => {
          if ($$props.msg.error.connection?.name || $$props.msg.error.connection?.detail) $$render(consequent_27);
        });
      }
      var button_14 = sibling(node_25, 2);
      reset(div_25);
      reset(div_23);
      template_effect(() => set_text(text_12, $$props.msg.error.message));
      delegated("click", button_14, () => conv.invoke("retry", $$props.msg));
      append($$anchor2, div_23);
    };
    var consequent_30 = ($$anchor2) => {
      var div_26 = root_372();
      var node_26 = child(div_26);
      MessageComposer(node_26, {
        onSend: handleMessageUpdate,
        onCancel: () => conv.edit.cancel(),
        enterBehavior: "newline",
        placeholder: "Edit this message\u2026",
        autofocus: true,
        get markdown() {
          return get(editContent);
        },
        set markdown($$value) {
          set(editContent, $$value, true);
        }
      });
      var div_27 = sibling(node_26, 2);
      var node_27 = sibling(child(div_27), 6);
      {
        var consequent_29 = ($$anchor3) => {
          var span_22 = root_362();
          append($$anchor3, span_22);
        };
        if_block(node_27, ($$render) => {
          if (get(isEditDirty)) $$render(consequent_29);
        });
      }
      reset(div_27);
      reset(div_26);
      append($$anchor2, div_26);
    };
    var consequent_31 = ($$anchor2) => {
      var div_28 = root_38();
      var node_28 = child(div_28);
      {
        let $0 = user_derived(() => $$props.msg.activeRevisions ?? { "0": 0 });
        let $1 = user_derived(() => $$props.msg.content ?? "");
        MessagePartsView(node_28, {
          get messageId() {
            return $$props.msg.id;
          },
          get parts() {
            return $$props.msg.parts;
          },
          get activeRevisions() {
            return get($0);
          },
          onOpenImage: (src) => void conv.request("view-image", { src }),
          get bodyText() {
            return get($1);
          },
          onAction: (fn, payload, action, blockId) => fireBlockAction(fn, $$props.msg, payload, action, blockId),
          canAnswer: (addressee) => conv.canAnswer(addressee),
          isStale: (block) => staleOf(block, $$props.msg, get(allMessages))
        });
      }
      reset(div_28);
      append($$anchor2, div_28);
    };
    var alternate_7 = ($$anchor2) => {
      var div_29 = root_39();
      var sp_message_body_4 = child(div_29);
      template_effect(() => set_custom_element_data(sp_message_body_4, "text", $$props.msg.content));
      template_effect(() => set_custom_element_data(sp_message_body_4, "streaming", $$props.msg.isGenerating ? "" : void 0));
      reset(div_29);
      template_effect(() => set_attribute(div_29, "data-streaming", $$props.msg.isGenerating && $$props.msg.content ? "" : void 0));
      event("open-image", sp_message_body_4, openImage);
      append($$anchor2, div_29);
    };
    if_block(node_22, ($$render) => {
      if ($$props.msg.error) $$render(consequent_28);
      else if (get(isEditing)) $$render(consequent_30, 1);
      else if (get(partsNative)) $$render(consequent_31, 2);
      else $$render(alternate_7, -1);
    });
  }
  reset(div_22);
  reset(div_21);
  var node_29 = sibling(div_21, 2);
  MessageStateLedger(node_29, {
    get messageId() {
      return $$props.msg.id;
    }
  });
  reset(div_7);
  var node_30 = sibling(div_7, 2);
  {
    let $0 = user_derived(() => get(isEditing) && get(canControl));
    let $1 = user_derived(() => get(canControl) ? (item) => void conv.request("remove-attachment", { messageId: $$props.msg.id, partId: item.partId }) : void 0);
    MessageMediaStrip(node_30, {
      get items() {
        return get(mediaItems);
      },
      get editing() {
        return get($0);
      },
      onOpen: (images, index2) => void conv.request("view-image", viewImageParams(images, index2)),
      get onRemove() {
        return get($1);
      }
    });
  }
  reset(div);
  template_effect(
    ($0) => {
      set_attribute(div, "id", `message-${$$props.msg.id ?? ""}`);
      set_attribute(div, "data-msg-role", get(msgRole));
      set_attribute(div, "data-msg-author", get(msgAuthor));
      set_attribute(div, "data-msg-state", get(isEditing) ? "editing" : get(isSummarizationMode) ? get(isSelected) ? "selected" : "dim" : "normal");
      set_attribute(div, "data-msg-generating", $$props.msg.isGenerating ? "" : void 0);
      set_attribute(div, "data-msg-hidden", $$props.msg.isHidden ? "" : void 0);
      set_attribute(div, "data-msg-greeting", get(isGreeting) ? "" : void 0);
      set_attribute(div, "data-msg-newest", $$props.isLastMessage ? "" : void 0);
      set_attribute(div, "aria-label", `Message ${$$props.index + 1} of ${get(messageCount) ?? ""} from ${get(displayName) ?? ""}${get(speakerMember) ? ` \xB7 ${get(speakerMember)}` : ""}: ${$0 ?? ""}${$$props.msg.content.length > 100 ? "..." : ""}`);
      set_attribute(div_21, "data-settled", $$props.msg.isGenerating ? void 0 : "");
    },
    [() => $$props.msg.content.slice(0, 100)]
  );
  append($$anchor, div);
  pop();
}
delegate(["click"]);

// components/sessions/messages/SessionContainer.svelte
var root9 = from_html(`<div data-widget-part="messages.log-note messages.log-floor" role="status" data-scope-not-granted="session:full"><sp-icon></sp-icon> <span data-widget-part="messages.log-floor-text"> </span></div>`, 2);
var root_117 = from_html(`<div data-widget-part="messages.log-loading messages.log-floor"><sp-icon></sp-icon> <span data-widget-part="messages.log-floor-text">Loading session\u2026</span></div>`, 2);
var root_215 = from_html(`<div data-widget-part="messages.log-empty messages.log-floor empty"><sp-icon></sp-icon> <span data-widget-part="messages.log-floor-text">Send a message to start</span></div>`, 2);
var root_310 = from_html(`<div data-widget-part="messages.older-loading"><div data-widget-part="messages.older-loading-body"><sp-icon></sp-icon> Loading older messages...</div></div>`, 2);
var root_48 = from_html(`<button data-widget-part="messages.history-marker" title="Open history entry in lorebook"><sp-icon></sp-icon> </button>`, 2);
var root_57 = from_html(`<span data-widget-part="messages.history-marker"><sp-icon></sp-icon> </span>`, 2);
var root_67 = from_html(`<li data-widget-part="messages.log-item" role="presentation"><!></li>`);
var root_77 = from_html(`<span data-widget-part="messages.scene-title-state">open</span>`);
var root_86 = from_html(`<li data-widget-part="messages.log-item" role="presentation"><button data-widget-part="messages.scene-title" title="Open scene in lorebook"><sp-icon></sp-icon> <!></button></li>`, 2);
var root_96 = from_html(`<button data-widget-part="messages.history-marker" title="Open next history entry in lorebook"><sp-icon></sp-icon> </button>`, 2);
var root_104 = from_html(`<button data-widget-part="messages.history-marker messages.history-start" title="Start a new history entry"><sp-icon></sp-icon> Start a new entry</button>`, 2);
var root_118 = from_html(`<!> <!> <li data-widget-part="messages.message-row"><!></li> <!>`, 1);
var root_124 = from_html(`<!> <ul data-widget-part="messages.message-list list" role="group"></ul> <!>`, 1);
var root_134 = from_html(`<div data-widget-part="messages.log-body"><sp-scroll><div id="session-history" data-widget-part="messages.stage" role="log" aria-live="polite" aria-atomic="false"><div data-widget-part="messages.stage-body"><!></div></div></sp-scroll></div>`, 2);
function SessionContainer($$anchor, $$props) {
  push($$props, true);
  const SCENE_COLORS = [
    {
      bar: "hsl(220,65%,62%)",
      text: "hsl(220,65%,65%)",
      bg: "hsl(220,65%,62%,0.10)"
    },
    // blue
    {
      bar: "hsl(150,52%,48%)",
      text: "hsl(150,52%,52%)",
      bg: "hsl(150,52%,48%,0.10)"
    },
    // green
    {
      bar: "hsl(35, 75%,55%)",
      text: "hsl(35, 75%,58%)",
      bg: "hsl(35, 75%,55%,0.10)"
    },
    // amber
    {
      bar: "hsl(280,55%,62%)",
      text: "hsl(280,55%,66%)",
      bg: "hsl(280,55%,62%,0.10)"
    },
    // purple
    {
      bar: "hsl(340,60%,58%)",
      text: "hsl(340,60%,62%)",
      bg: "hsl(340,60%,58%,0.10)"
    },
    // rose
    {
      bar: "hsl(190,60%,48%)",
      text: "hsl(190,60%,52%)",
      bg: "hsl(190,60%,48%,0.10)"
    },
    // teal
    {
      bar: "hsl(55, 70%,50%)",
      text: "hsl(55, 70%,54%)",
      bg: "hsl(55, 70%,50%,0.10)"
    },
    // yellow
    {
      bar: "hsl(15, 70%,55%)",
      text: "hsl(15, 70%,59%)",
      bg: "hsl(15, 70%,55%,0.10)"
    }
    // orange
  ];
  let order = prop($$props, "order", 3, "oldest-first"), showSceneMarkers = prop($$props, "showSceneMarkers", 3, true);
  const conv = useConversation();
  const messages = user_derived(() => conv.rows);
  const sceneList = user_derived(() => conv.dossier?.scenes ?? []);
  const loadingOlderMessages = user_derived(() => !!conv.dossier?.loadingOlder);
  const loaded = user_derived(() => !!conv.dossier);
  const dossierNotGranted = user_derived(() => scopeNotGranted(conv.ctx, "session:full"));
  function loadOlder() {
    if (!conv.dossier?.hasOlder || conv.dossier.loadingOlder) return;
    void conv.request("messages", {});
  }
  const openLore = (params) => void conv.request("open-lore", params);
  let msgOrderKey = user_derived(() => get(messages).map((m) => m.id).join(","));
  let msgSceneMap = user_derived(() => {
    void get(sceneList).length;
    void get(msgOrderKey);
    if (!showSceneMarkers()) return /* @__PURE__ */ new Map();
    return untrack(buildMsgSceneMap);
  });
  let drawnMessages = user_derived(() => orderedMessages(get(messages), order()));
  function buildMsgSceneMap() {
    const map = /* @__PURE__ */ new Map();
    if (!get(sceneList).length || !get(messages).length) return map;
    const messageToScene = /* @__PURE__ */ new Map();
    for (const scene of get(sceneList)) {
      for (const msgId of scene.selectedMessageIds ?? []) {
        messageToScene.set(msgId, scene);
      }
    }
    const sceneBounds = /* @__PURE__ */ new Map();
    for (const scene of get(sceneList)) {
      const ids = new Set(scene.selectedMessageIds ?? []);
      if (!ids.size) continue;
      const ordered = get(messages).filter((m) => ids.has(m.id)).map((m) => m.id);
      if (ordered.length) sceneBounds.set(scene.id, { first: ordered[0], last: ordered[ordered.length - 1] });
    }
    const entryLastMsgIndex = /* @__PURE__ */ new Map();
    for (const scene of get(sceneList)) {
      if (!scene.historyEntryId) continue;
      const bounds = sceneBounds.get(scene.id);
      if (!bounds) continue;
      const idx = get(messages).findIndex((m) => m.id === bounds.last);
      const current = entryLastMsgIndex.get(scene.historyEntryId) ?? -1;
      if (idx > current) entryLastMsgIndex.set(scene.historyEntryId, idx);
    }
    const entryLastMsgId = /* @__PURE__ */ new Map();
    for (const [entryId, idx] of entryLastMsgIndex) {
      entryLastMsgId.set(entryId, get(messages)[idx].id);
    }
    const sceneColorIndex = /* @__PURE__ */ new Map();
    let colorCounter = 0;
    for (const msg of get(messages)) {
      const scene = messageToScene.get(msg.id);
      if (scene && !sceneColorIndex.has(scene.id)) {
        sceneColorIndex.set(scene.id, colorCounter % SCENE_COLORS.length);
        colorCounter++;
      }
    }
    const seenEntryIds = /* @__PURE__ */ new Set();
    for (const msg of get(messages)) {
      const scene = messageToScene.get(msg.id);
      if (!scene) continue;
      const bounds = sceneBounds.get(scene.id);
      if (!bounds) continue;
      const isFirstInScene = bounds.first === msg.id;
      const isLastInScene = bounds.last === msg.id;
      const entryId = scene.historyEntryId;
      const isFirstOfEntry = isFirstInScene && !!entryId && !seenEntryIds.has(entryId);
      if (isFirstOfEntry) seenEntryIds.add(entryId);
      const isLastOfEntry = !!entryId && entryLastMsgId.get(entryId) === msg.id;
      map.set(msg.id, {
        scene,
        isFirstInScene,
        isLastInScene,
        historyEntry: scene.historyEntry,
        isFirstOfEntry,
        isLastOfEntry,
        colorIndex: sceneColorIndex.get(scene.id) ?? 0
      });
    }
    return map;
  }
  function formatEntryDate(he) {
    let s = `Year ${he.year}`;
    if (he.month) s += `, Mo. ${he.month}`;
    if (he.day) s += `, Day ${he.day}`;
    return s;
  }
  var div = root_134();
  var sp_scroll = child(div);
  set_custom_element_data(sp_scroll, "data-widget-part", "messages.log-scroll");
  template_effect(() => set_custom_element_data(sp_scroll, "stick", order() === "newest-first" ? "top" : "bottom"));
  set_custom_element_data(sp_scroll, "label", "Session messages");
  var div_1 = child(sp_scroll);
  var div_2 = child(div_1);
  var node = child(div_2);
  {
    var consequent = ($$anchor2) => {
      var div_3 = root9();
      var sp_icon = child(div_3);
      set_custom_element_data(sp_icon, "name", "lock");
      set_custom_element_data(sp_icon, "size", "28");
      set_custom_element_data(sp_icon, "data-widget-part", "messages.log-floor-icon");
      var span = sibling(sp_icon, 2);
      var text3 = child(span, true);
      reset(span);
      reset(div_3);
      template_effect(($0) => set_text(text3, $0), [
        () => conv.t("This widget has not been granted the whole conversation. An administrator can grant it in the extension's permissions.")
      ]);
      append($$anchor2, div_3);
    };
    var consequent_1 = ($$anchor2) => {
      var div_4 = root_117();
      var sp_icon_1 = child(div_4);
      set_custom_element_data(sp_icon_1, "name", "loader-2");
      set_custom_element_data(sp_icon_1, "size", "28");
      set_custom_element_data(sp_icon_1, "data-widget-part", "messages.log-floor-icon messages.log-loading-icon");
      next(2);
      reset(div_4);
      append($$anchor2, div_4);
    };
    var consequent_2 = ($$anchor2) => {
      var div_5 = root_215();
      var sp_icon_2 = child(div_5);
      set_custom_element_data(sp_icon_2, "name", "message-square-text");
      set_custom_element_data(sp_icon_2, "size", "28");
      set_custom_element_data(sp_icon_2, "data-widget-part", "messages.log-floor-icon");
      next(2);
      reset(div_5);
      append($$anchor2, div_5);
    };
    var alternate_2 = ($$anchor2) => {
      const olderMessagesLoading = ($$anchor3) => {
        var fragment = comment();
        var node_1 = first_child(fragment);
        {
          var consequent_3 = ($$anchor4) => {
            var div_6 = root_310();
            var div_7 = child(div_6);
            var sp_icon_3 = child(div_7);
            set_custom_element_data(sp_icon_3, "name", "loader-2");
            set_custom_element_data(sp_icon_3, "size", "16");
            set_custom_element_data(sp_icon_3, "data-widget-part", "messages.older-loading-icon");
            next();
            reset(div_7);
            reset(div_6);
            append($$anchor4, div_6);
          };
          if_block(node_1, ($$render) => {
            if (get(loadingOlderMessages)) $$render(consequent_3);
          });
        }
        append($$anchor3, fragment);
      };
      var fragment_1 = root_124();
      var node_2 = first_child(fragment_1);
      {
        var consequent_4 = ($$anchor3) => {
          olderMessagesLoading($$anchor3);
        };
        if_block(node_2, ($$render) => {
          if (order() === "oldest-first") $$render(consequent_4);
        });
      }
      var ul = sibling(node_2, 2);
      each(ul, 23, () => get(drawnMessages), (msg) => msg.id, ($$anchor3, msg, row) => {
        const index2 = user_derived(() => conversationIndex(get(row), get(messages).length, order()));
        const isLastMessage = user_derived(() => get(index2) === get(messages).length - 1);
        const onThisChannel = user_derived(() => (get(msg).channel || "main") === conv.lane.current);
        const si = user_derived(() => get(msgSceneMap).get(get(msg).id));
        const color = user_derived(() => get(si) ? SCENE_COLORS[get(si).colorIndex] : null);
        var fragment_3 = root_118();
        var node_3 = first_child(fragment_3);
        {
          var consequent_6 = ($$anchor4) => {
            var li = root_67();
            var node_4 = child(li);
            {
              var consequent_5 = ($$anchor5) => {
                var button = root_48();
                var sp_icon_4 = child(button);
                set_custom_element_data(sp_icon_4, "name", "calendar");
                set_custom_element_data(sp_icon_4, "size", "12");
                var text_1 = sibling(sp_icon_4);
                reset(button);
                template_effect(($0) => set_text(text_1, ` ${$0 ?? ""}`), [() => formatEntryDate(get(si).historyEntry)]);
                delegated("click", button, () => openLore({
                  scope: "history",
                  entryId: get(si).scene.historyEntryId,
                  lorebookId: get(si).scene.lorebookId
                }));
                append($$anchor5, button);
              };
              var alternate = ($$anchor5) => {
                var span_1 = root_57();
                var sp_icon_5 = child(span_1);
                set_custom_element_data(sp_icon_5, "name", "calendar");
                set_custom_element_data(sp_icon_5, "size", "12");
                var text_2 = sibling(sp_icon_5);
                reset(span_1);
                template_effect(($0) => set_text(text_2, ` ${$0 ?? ""}`), [() => formatEntryDate(get(si).historyEntry)]);
                append($$anchor5, span_1);
              };
              if_block(node_4, ($$render) => {
                if (get(si).scene.historyEntryId) $$render(consequent_5);
                else $$render(alternate, -1);
              });
            }
            reset(li);
            append($$anchor4, li);
          };
          if_block(node_3, ($$render) => {
            if (get(si)?.isFirstOfEntry && get(si).historyEntry) $$render(consequent_6);
          });
        }
        var node_5 = sibling(node_3, 2);
        {
          var consequent_8 = ($$anchor4) => {
            var li_1 = root_86();
            var button_1 = child(li_1);
            var sp_icon_6 = child(button_1);
            set_custom_element_data(sp_icon_6, "name", "film");
            set_custom_element_data(sp_icon_6, "size", "14");
            var text_3 = sibling(sp_icon_6);
            var node_6 = sibling(text_3);
            {
              var consequent_7 = ($$anchor5) => {
                var span_2 = root_77();
                append($$anchor5, span_2);
              };
              if_block(node_6, ($$render) => {
                if (get(si).historyEntry && !get(si).historyEntry.isCompleted) $$render(consequent_7);
              });
            }
            reset(button_1);
            reset(li_1);
            template_effect(() => {
              set_style(li_1, `--sp-scene: ${get(color).text ?? ""}`);
              set_text(text_3, ` ${get(si).scene.name ?? "Scene" ?? ""} `);
            });
            delegated("click", button_1, () => openLore({
              scope: "scenes",
              sceneId: get(si).scene.id,
              entryId: get(si).scene.historyEntryId ?? void 0,
              lorebookId: get(si).scene.lorebookId
            }));
            append($$anchor4, li_1);
          };
          if_block(node_5, ($$render) => {
            if (get(si)?.isFirstInScene && get(color)) $$render(consequent_8);
          });
        }
        var li_2 = sibling(node_5, 2);
        var node_7 = child(li_2);
        {
          let $0 = user_derived(() => get(si) ? get(si).scene.name ?? "Scene" : null);
          SessionMessage(node_7, {
            get msg() {
              return get(msg);
            },
            get index() {
              return get(index2);
            },
            get isLastMessage() {
              return get(isLastMessage);
            },
            get sceneName() {
              return get($0);
            }
          });
        }
        reset(li_2);
        var node_8 = sibling(li_2, 2);
        {
          var consequent_10 = ($$anchor4) => {
            var li_3 = root_67();
            var node_9 = child(li_3);
            {
              var consequent_9 = ($$anchor5) => {
                const next2 = user_derived(() => get(si).historyEntry.nextEntry);
                var button_2 = root_96();
                var sp_icon_7 = child(button_2);
                set_custom_element_data(sp_icon_7, "name", "calendar");
                set_custom_element_data(sp_icon_7, "size", "12");
                var text_4 = sibling(sp_icon_7);
                reset(button_2);
                template_effect(($0) => set_text(text_4, ` Next: ${$0 ?? ""}`), [() => formatEntryDate(get(next2))]);
                delegated("click", button_2, () => openLore({
                  scope: "history",
                  entryId: get(next2).id,
                  lorebookId: get(si).scene.lorebookId
                }));
                append($$anchor5, button_2);
              };
              var alternate_1 = ($$anchor5) => {
                var button_3 = root_104();
                var sp_icon_8 = child(button_3);
                set_custom_element_data(sp_icon_8, "name", "calendar-plus");
                set_custom_element_data(sp_icon_8, "size", "12");
                next();
                reset(button_3);
                delegated("click", button_3, () => openLore({
                  scope: "history",
                  create: true,
                  lorebookId: get(si).scene.lorebookId
                }));
                append($$anchor5, button_3);
              };
              if_block(node_9, ($$render) => {
                if (get(si).historyEntry.nextEntry) $$render(consequent_9);
                else $$render(alternate_1, -1);
              });
            }
            reset(li_3);
            append($$anchor4, li_3);
          };
          if_block(node_8, ($$render) => {
            if (get(si)?.isLastOfEntry && get(si).historyEntry?.isCompleted) $$render(consequent_10);
          });
        }
        template_effect(
          ($0) => {
            set_attribute(li_2, "hidden", !get(onThisChannel));
            set_style(li_2, get(color) ? `--sp-scene: ${get(color).text}` : void 0);
            set_attribute(li_2, "data-scene", get(si) ? get(si).scene.id : void 0);
            set_attribute(li_2, "data-arrive", $0);
          },
          [
            () => untrack(() => get(loadingOlderMessages) || !get(isLastMessage) ? void 0 : "")
          ]
        );
        append($$anchor3, fragment_3);
      });
      reset(ul);
      var node_10 = sibling(ul, 2);
      {
        var consequent_11 = ($$anchor3) => {
          olderMessagesLoading($$anchor3);
        };
        if_block(node_10, ($$render) => {
          if (order() === "newest-first") $$render(consequent_11);
        });
      }
      template_effect(() => set_attribute(ul, "aria-label", `Session conversation with ${get(messages).length ?? ""} messages`));
      append($$anchor2, fragment_1);
    };
    if_block(node, ($$render) => {
      if (!get(loaded) && get(dossierNotGranted)) $$render(consequent);
      else if (!get(loaded)) $$render(consequent_1, 1);
      else if (get(messages).length === 0) $$render(consequent_2, 2);
      else $$render(alternate_2, -1);
    });
  }
  reset(div_2);
  reset(div_1);
  reset(sp_scroll);
  reset(div);
  event("reach-start", sp_scroll, loadOlder);
  append($$anchor, div);
  pop();
}
delegate(["click"]);

// components/sessions/messages/SessionComposer.svelte
var root10 = from_html(`<div data-widget-part="messages.join"><div data-widget-part="messages.join-text"><sp-icon></sp-icon> <h3 data-widget-part="messages.join-title">Join the conversation</h3> <p data-widget-part="messages.join-note">Add a persona to this session to send messages.</p></div> <button data-widget-part="messages.join-button"><sp-icon></sp-icon> Add your persona</button></div>`, 2);
var root_119 = from_html(`<button type="button" data-widget-part="messages.composer-actions-toggle"><span>Actions</span> <sp-icon></sp-icon></button>`, 2);
var root_216 = from_html(`<div data-widget-part="messages.composer-notice"><sp-host-view></sp-host-view></div>`, 2);
var root_311 = from_html(`<sp-host-view></sp-host-view>`, 2);
var root_49 = from_html(`<span data-widget-part="messages.composer-new-dot" aria-hidden="true"></span>`);
var root_58 = from_html(`<span data-widget-part="messages.composer-overflow-note"> </span>`);
var root_68 = from_html(`<span data-widget-part="messages.composer-new">New</span>`);
var root_78 = from_html(`<sp-menu-item><sp-icon></sp-icon> <span> <span data-widget-part="messages.composer-overflow-slash"> </span> <!></span> <!></sp-menu-item>`, 2);
var root_87 = from_html(`<sp-menu><button slot="trigger" type="button" data-widget-part="messages.composer-more-actions" title="More actions"><sp-icon></sp-icon> More <!></button> <!></sp-menu>`, 2);
var root_97 = from_html(`<div data-widget-part="messages.composer-actions-row" role="group" aria-label="Session actions"><div data-widget-part="messages.composer-actions messages.composer-chips"><!> <!> <!></div></div>`);
var root_105 = from_html(`<div data-widget-part="messages.composer-meter" role="progressbar" aria-label="Context window used"><div data-widget-part="messages.composer-meter-fill"></div></div>`);
var root_1110 = from_html(`<button type="button" data-widget-part="messages.composer-back"><sp-icon></sp-icon> Back to compose</button>`, 2);
var root_125 = from_html(`<div data-widget-part="messages.composer-pane-head"><span data-widget-part="messages.composer-pane-title"> </span> <!></div> <div role="region"><sp-host-view></sp-host-view></div>`, 3);
var root_135 = from_html(`<div data-widget-part="messages.composer-preview" role="region" aria-label="Message preview"><sp-message-body></sp-message-body></div>`, 2);
var root_144 = from_html(`<span data-widget-part="messages.composer-palette-argument"> </span>`);
var root_154 = from_html(`<span data-widget-part="messages.composer-palette-note"> </span>`);
var root_164 = from_html(`<li role="option" data-widget-part="messages.composer-palette-row"><button type="button" data-widget-part="messages.composer-palette-button" tabindex="-1"><sp-icon></sp-icon> <span data-widget-part="messages.composer-palette-slash"> </span> <!> <span data-widget-part="messages.composer-palette-label"> </span> <!> <!></button></li>`, 2);
var root_174 = from_html(`<ul data-widget-part="messages.composer-palette" role="listbox" aria-label="Slash commands"></ul>`);
var root_183 = from_html(`<!>  <sp-composer-field></sp-composer-field>`, 3);
var root_193 = from_html(`<img data-widget-part="messages.composer-tray-thumb" alt="" loading="lazy" decoding="async"/>`);
var root_203 = from_html(`<sp-icon></sp-icon>`, 2);
var root_217 = from_html(`<span data-widget-part="messages.composer-tray-progress" role="progressbar"></span>`);
var root_224 = from_html(`<span data-widget-part="messages.composer-tray-refusal"> </span>`);
var root_234 = from_html(`<li data-widget-part="messages.composer-tray-item"><!> <span data-widget-part="messages.composer-tray-name"> </span> <!> <button type="button" data-widget-part="messages.composer-tray-remove" title="Remove"><sp-icon></sp-icon></button></li>`, 2);
var root_243 = from_html(`<li data-widget-part="messages.composer-tray-item" data-status="refused"><sp-icon></sp-icon> <span data-widget-part="messages.composer-tray-name"> </span> <span data-widget-part="messages.composer-tray-refusal"> </span></li>`, 2);
var root_253 = from_html(`<ul data-widget-part="messages.composer-tray" aria-label="Attachments"><!> <!></ul>`);
var root_263 = from_html(`<button type="button" data-widget-part="messages.composer-channel"> </button>`);
var root_273 = from_html(`<div data-widget-part="messages.composer-channels" role="group" aria-label="Which channel you are writing on"></div>`);
var root_283 = from_html(`<button type="button" data-widget-part="messages.composer-persona-option"><sp-avatar></sp-avatar> <span data-widget-part="messages.composer-persona-option-name"> </span></button>`, 2);
var root_293 = from_html(`<sp-popover><button slot="trigger" type="button" data-widget-part="messages.composer-persona" title="Switch persona"><sp-avatar></sp-avatar> <span data-widget-part="messages.composer-persona-name"> </span> <sp-icon></sp-icon></button> <div data-widget-part="messages.composer-persona-menu"><p data-widget-part="messages.composer-persona-menu-title">Write as</p> <!></div></sp-popover>`, 2);
var root_302 = from_html(`<span data-widget-part="messages.composer-persona"><sp-avatar></sp-avatar> <span data-widget-part="messages.composer-persona-name"> </span></span>`, 2);
var root_312 = from_html(`<sp-file-picker><button type="button" data-widget-part="messages.composer-attach-button messages.composer-icon-button" aria-label="Attach files"><sp-icon></sp-icon></button></sp-file-picker>`, 2);
var root_323 = from_html(`<button type="button" data-widget-part="messages.composer-preview-toggle messages.composer-icon-button" title="Preview" aria-label="Preview the formatted draft"><sp-icon></sp-icon></button>`, 2);
var root_333 = from_html(`<button type="button" data-widget-part="messages.composer-pane-option"><sp-icon></sp-icon> <span> </span></button>`, 2);
var root_343 = from_html(`<button type="button" data-widget-part="messages.composer-pane-option messages.composer-readers-button"><sp-icon></sp-icon> <span>What can be attached</span></button>`, 2);
var root_353 = from_html(`<sp-popover><button slot="trigger" type="button" data-widget-part="messages.composer-more messages.composer-icon-button" title="More" aria-label="More"><sp-icon></sp-icon></button> <div data-widget-part="messages.composer-panes"><header data-widget-part="messages.composer-panes-title"><sp-icon></sp-icon> <p>More</p></header> <div data-widget-part="messages.composer-panes-list"><!> <!></div></div></sp-popover>`, 2);
var root_363 = from_html(`<button type="button" data-widget-part="messages.composer-stop" title="Stop" aria-label="Stop generating"><sp-icon></sp-icon> <span>Stop</span></button>`, 2);
var root_373 = from_html(`<button type="button" data-widget-part="messages.composer-send" title="Send" aria-label="Send message"><sp-icon></sp-icon> <span>Send</span></button>`, 2);
var root_382 = from_html(`<p data-widget-part="messages.composer-announce" aria-live="polite"> </p>`);
var root_392 = from_html(`<span>\u2014 can be attached</span>`);
var root_402 = from_html(`<span data-widget-part="messages.composer-readers-reason"> </span>`);
var root_41 = from_html(`<li data-widget-part="messages.composer-readers-kind"><strong> </strong> <span> </span> <!></li>`);
var root_422 = from_html(`<li> </li>`);
var root_432 = from_html(`<ul data-widget-part="messages.composer-readers-calls" aria-label="Each model call"></ul>`);
var root_442 = from_html(`<sp-dialog><span slot="title">What can be attached</span> <div data-widget-part="messages.composer-readers"><p data-widget-part="messages.composer-readers-line"> </p> <ul data-widget-part="messages.composer-readers-kinds" aria-label="Kinds of file"></ul> <!></div></sp-dialog>`, 2);
var root_452 = from_html(`<p data-widget-part="messages.composer-hint" aria-live="polite"> </p>`);
var root_462 = from_html(`<p data-widget-part="messages.composer-warning" role="alert">This draft pushes the prompt past the context limit. Older turns
				will be trimmed.</p>`);
var root_472 = from_html(`highlights the first \xB7 <kbd data-widget-part="messages.composer-key">\u2191</kbd> <kbd data-widget-part="messages.composer-key">\u2193</kbd> to choose`, 1);
var root_482 = from_html(`<p data-widget-part="messages.composer-hint" aria-live="polite"><kbd data-widget-part="messages.composer-key">Enter</kbd> <!> \xB7 <kbd data-widget-part="messages.composer-key">Esc</kbd> closes.</p>`);
var root_492 = from_html(`<kbd data-widget-part="messages.composer-key"> </kbd> `, 1);
var root_50 = from_html(`<p data-widget-part="messages.composer-hint" aria-live="polite"><!></p>`);
var root_51 = from_html(`<p data-widget-part="messages.composer-hint"><kbd data-widget-part="messages.composer-key">Enter</kbd> sends. <kbd data-widget-part="messages.composer-key">Shift</kbd> <kbd data-widget-part="messages.composer-key">Enter</kbd> for a new line.</p>`);
var root_522 = from_html(`<sp-host-view></sp-host-view> <div data-widget-part="messages.composer-disclosure"><div data-widget-part="messages.composer-disclosure-bar"><!> <!></div> <!></div> <sp-drop-zone><div data-widget-part="messages.composer-card"><!> <div data-widget-part="messages.composer-body"><!></div> <!> <div data-widget-part="messages.composer-footer"><!> <!> <div data-widget-part="messages.composer-footer-end"><!> <!> <!> <!></div></div></div></sp-drop-zone> <!> <!> <!> <!> <!>`, 3);
var root_532 = from_html(`<div data-widget-part="messages.composer" role="group" aria-label="Compose"><!></div>`);
function SessionComposer($$anchor, $$props) {
  const uid = props_id();
  push($$props, true);
  const TURN_CONTROLS_VIEW = "session-controls";
  let composerSkin = prop($$props, "composerSkin", 3, "classic"), showActions = prop($$props, "showActions", 3, true);
  const conv = useConversation();
  const c = user_derived(() => conv.dossier?.composer);
  const hideCompose = user_derived(() => !!get(c)?.hidden);
  const channels = user_derived(() => get(c)?.channels ?? []);
  const overflowActions = user_derived(() => get(c)?.overflow ?? []);
  const paletteActions = user_derived(() => get(c)?.palette ?? []);
  const newestItem = user_derived(() => get(c)?.newest ?? null);
  const sendTonal = user_derived(() => !!get(c)?.sendTonal);
  const actionsListed = user_derived(() => !!get(c)?.actions);
  let draft = state("");
  let written = null;
  let writtenFor = null;
  user_effect(() => {
    const write = get(c)?.draft ?? null;
    const session = conv.dossier?.sessionId ?? null;
    if (session === writtenFor && (write?.write ?? null) === written) return;
    writtenFor = session;
    written = write?.write ?? null;
    setField(write?.content ?? "");
  });
  user_effect(() => {
    const content = get(draft);
    const t = setTimeout(() => void conv.request("draft", { content }), 150);
    return () => clearTimeout(t);
  });
  let fieldValue = state("");
  let fieldWrites = state(0);
  function setField(text3) {
    set(draft, text3, true);
    set(fieldValue, text3, true);
    update(fieldWrites);
  }
  const writeField = (el) => {
    void get(fieldWrites);
    const v = get(fieldValue);
    el.removeAttribute("value");
    el.setAttribute("value", v);
  };
  function send() {
    const content = get(draft);
    const trayItemIds = sendableTrayIds(get(tray));
    if (!content.trim() && !trayItemIds.length && !get(uploading)) return;
    const command = content.trim() ? exactSlashCommand(get(paletteActions), content) : void 0;
    if (command) {
      invokePalette(command.action, command.argument);
      return;
    }
    if (get(uploading)) {
      set(sendWaiting, true);
      return;
    }
    set(sendWaiting, false);
    conv.ctx.request("send", {
      content,
      personaId: get(c)?.personaId ?? null,
      channel: conv.lane.current,
      ...trayItemIds.length ? { trayItemIds } : {}
    }).then(
      () => {
        if (get(draft) === content) setField("");
      },
      (e) => console.warn(`Send: ${e.message}`)
    );
    set(paletteDismissed, null);
    set(paletteHighlight, -1);
  }
  const tray = user_derived(() => get(c)?.tray ?? []);
  const readers = user_derived(() => get(c)?.attachments ?? null);
  const offersAttachments = user_derived(() => get(c)?.tray !== void 0 && !get(hideCompose));
  const readersLine = user_derived(() => readersSummary(get(readers)));
  const readerLines = user_derived(() => readerCallLines(get(readers)));
  const readersOffered = user_derived(() => get(offersAttachments) && !!get(readersLine));
  const uploading = user_derived(() => uploadingNote(get(tray)));
  const hasAttachments = user_derived(() => get(tray).some((t) => t.status !== "refused"));
  let readersOpen = state(false);
  let sendWaiting = state(false);
  user_effect(() => {
    if (get(sendWaiting) && !get(uploading)) untrack(() => send());
  });
  let refusedHere = state(proxy([]));
  let refusalSeq = 0;
  let announcement = state("");
  async function attachFiles(files) {
    if (!files.length) return;
    const sniffed = await Promise.all(files.map(async (f) => ({
      name: f.name,
      size: f.size,
      kind: sniffAttachmentKind(new Uint8Array(await f.slice(0, 512).arrayBuffer()), f.name, f.type)
    })));
    const { accept, refusals } = preCheckFiles(sniffed, get(tray), get(readers));
    for (const r of refusals) {
      const key = ++refusalSeq;
      set(refusedHere, [...get(refusedHere), { ...r, key }], true);
      setTimeout(() => set(refusedHere, get(refusedHere).filter((x) => x.key !== key), true), 6e3);
    }
    if (refusals.length) set(announcement, refusals.map((r) => `Can't attach ${r.filename}: ${r.reason}`).join(" "), true);
    if (accept.length) conv.ctx.request("attach-files", { files: accept.map((i) => files[i]) }).catch((e) => set(announcement, e.message, true));
  }
  function removeTrayItem(item) {
    void conv.ctx.request("remove-tray-item", { trayItemId: item.id }).catch(() => {
    });
    set(announcement, `${item.filename} removed`);
  }
  const heard = /* @__PURE__ */ new Map();
  user_effect(() => {
    for (const t of get(tray)) {
      const was = heard.get(t.id);
      if (was === t.status) continue;
      heard.set(t.id, t.status);
      if (was === void 0 && t.status === "uploading") continue;
      if (t.status === "ready") untrack(() => set(announcement, `${t.filename} attached`));
      if (t.status === "refused") untrack(() => set(announcement, `Can't attach ${t.filename}: ${t.refusal ?? ""}`));
    }
  });
  const pickerAccept = user_derived(() => get(readers)?.accept ?? "");
  const progressOf = (t) => Math.round(Math.min(Math.max(t.progress, 0), 1) * 100);
  const channelLabel = (slug) => conv.channelName(slug);
  const inputId = `composer-input-${uid}`;
  const warningId = `composer-warning-${uid}`;
  const actionsId = `composer-actions-${uid}`;
  const paletteId = `composer-palette-${uid}`;
  const paletteOptionId = (i) => `${paletteId}-option-${i}`;
  let personaSwitcherOpen = state(false);
  let moreMenuOpen = state(false);
  let actionsOpen = state(false);
  let previewOpen = state(false);
  let activePaneValue = state(null);
  const submitOnEnter = user_derived(() => conv.ctx.layout?.v1?.tier !== "compact");
  let hintSeen = state(true);
  const saved = user_derived(() => conv.ctx.state);
  user_effect(() => {
    set(hintSeen, !!get(saved)?.hintSeen);
  });
  let hintVisible = state(false);
  const activePersona = user_derived(() => get(c)?.personas.find((p) => p.personaId === get(c)?.personaId) ?? null);
  const personaCount = user_derived(() => get(c)?.personas.length ?? 0);
  const tabs = user_derived(() => get(c)?.tabs ?? []);
  let turnControls = user_derived(() => get(tabs).find((t) => t.view === TURN_CONTROLS_VIEW));
  let morePanes = user_derived(() => get(tabs).filter((t) => t.view !== TURN_CONTROLS_VIEW));
  let activePane = user_derived(() => get(morePanes).find((t) => t.view === get(activePaneValue)));
  let hasActionsRow = user_derived(() => get(actionsListed) || !!get(turnControls) || get(overflowActions).length > 0);
  let overflowNew = user_derived(() => get(overflowActions).filter((a) => a.isNew));
  let overflowOpen = state(false);
  const overflowRow = (a) => ({
    name: a.name,
    audience: a.audience,
    canAct: a.canAct,
    enabled: a.enabled,
    venue: a.venue,
    ...a.reason ? {
      reason: i18nText(a.reason.i18n, conv.ctx.locale.v1) ?? a.reason.i18n.en
    } : {},
    ...a.itemPredicates?.length ? { itemPredicates: a.itemPredicates } : {}
  });
  let paletteDismissed = state(null);
  let paletteHighlight = state(-1);
  const paletteQuery = user_derived(() => slashQueryOf(get(draft)));
  const paletteRows = user_derived(() => get(paletteQuery) === null || !get(paletteActions).length ? [] : filterPaletteActions(get(paletteActions), get(paletteQuery)));
  const paletteOpen = user_derived(() => get(paletteDismissed) !== get(paletteQuery) && get(paletteRows).length > 0 && !get(hideCompose));
  user_effect(() => {
    if (get(paletteHighlight) >= get(paletteRows).length) set(paletteHighlight, get(paletteRows).length ? 0 : -1, true);
  });
  const paletteEnterPick = user_derived(() => !get(paletteOpen) ? void 0 : get(paletteHighlight) >= 0 ? get(paletteRows)[get(paletteHighlight)] : exactPaletteMatch(get(paletteActions), get(draft)) ?? (get(paletteQuery) ? get(paletteRows)[0] : void 0));
  user_effect(() => {
    if (!get(paletteOpen)) return;
    const fresh = get(paletteRows).filter((a) => a.isNew);
    if (fresh.length) void conv.request("actions-seen", { keys: fresh.map(actionIdentity) });
  });
  function invokePalette(action, argument = null) {
    if (paletteRowState(action, { generating: get(isGenerating), newest: get(newestItem) }).disabled) return;
    if (argument === null) setField("");
    set(paletteDismissed, null);
    set(paletteHighlight, -1);
    conv.invoke(actionIdentity(action), void 0, void 0, argument ?? void 0);
  }
  const slashCommand = user_derived(() => {
    const command = exactSlashCommand(get(paletteActions), get(draft));
    return command?.argument ? command : void 0;
  });
  const slashRefusal = user_derived(() => get(slashCommand) ? slashArgumentRefusal(get(slashCommand).action, get(slashCommand).argument) : null);
  const capturedKeys = user_derived(() => get(paletteOpen) ? "ArrowUp ArrowDown Escape Enter Tab" : exactPaletteMatch(get(paletteActions), get(draft)) || get(slashCommand) && get(submitOnEnter) ? "Enter" : "");
  function handlePaletteKey(e) {
    if (get(paletteOpen)) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        set(paletteHighlight, stepHighlight(get(paletteHighlight), get(paletteRows).length, e.key === "ArrowDown" ? 1 : -1), true);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        set(paletteDismissed, get(paletteQuery), true);
        return true;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const pick = get(paletteEnterPick);
        if (pick) invokePalette(pick);
        else set(paletteHighlight, 0);
        return true;
      }
      if (e.key === "Tab" && get(paletteRows).length) {
        e.preventDefault();
        const pick = get(paletteRows)[get(paletteHighlight) >= 0 ? get(paletteHighlight) : 0];
        setField(`/${pick.slash}${slashArgumentHint(pick) ? " " : ""}`);
        return true;
      }
      return false;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const exact = exactPaletteMatch(get(paletteActions), get(draft));
      if (exact) {
        e.preventDefault();
        invokePalette(exact);
        return true;
      }
      if (get(slashCommand) && get(submitOnEnter)) {
        e.preventDefault();
        invokePalette(get(slashCommand).action, get(slashCommand).argument);
        return true;
      }
    }
    return false;
  }
  function handleOverflowOpen(open) {
    set(overflowOpen, open, true);
    if (open && get(overflowNew).length) void conv.request("actions-seen", { keys: get(overflowNew).map(actionIdentity) });
  }
  let actionsLabelShown = user_derived(() => showActions() && get(hasActionsRow));
  let tokenCounts = user_derived(() => get(c)?.usage ?? null);
  let usageRatio = user_derived(() => get(tokenCounts) && get(tokenCounts).limit > 0 ? Math.min(get(tokenCounts).total / get(tokenCounts).limit, 1) : null);
  let contextExceeded = user_derived(() => get(tokenCounts) ? get(tokenCounts).total > get(tokenCounts).limit : false);
  const messages = user_derived(() => conv.ctx.messages.v1);
  let isGenerating = user_derived(() => !!get(messages)[get(messages).length - 1]?.isGenerating);
  let ragVisible = user_derived(() => !!get(c)?.notice && composerSkin() !== "minimal");
  let placeholder = user_derived(() => get(activePersona) ? `Write as ${get(activePersona).name}\u2026` : get(c)?.playerLabel ? `Write as the ${get(c).playerLabel}\u2026` : "Write a message\u2026");
  user_effect(() => {
    const values = get(morePanes).map((p) => p.view);
    if (get(activePaneValue) && !values.includes(get(activePaneValue))) {
      set(activePaneValue, null);
    }
    if (get(hideCompose) && !get(activePaneValue) && values.length) {
      set(activePaneValue, values[0], true);
    }
  });
  function handleFieldKey(e) {
    const ev = {
      key: e.detail.key,
      shiftKey: e.detail.shift,
      preventDefault() {
      }
    };
    if (handlePaletteKey(ev)) return;
    if (ev.key === "Enter" && !ev.shiftKey && get(submitOnEnter)) send();
  }
  function handleFieldFocus() {
    if (get(hintSeen) || !get(submitOnEnter)) return;
    set(hintVisible, true);
    set(hintSeen, true);
    conv.ctx.saveState?.({ ...get(saved) ?? {}, hintSeen: true });
  }
  function openPane(value) {
    set(activePaneValue, value, true);
    set(previewOpen, false);
    set(moreMenuOpen, false);
  }
  function openReaders() {
    set(moreMenuOpen, false);
    set(readersOpen, true);
  }
  function backToCompose() {
    set(activePaneValue, null);
  }
  function togglePreview() {
    set(previewOpen, !get(previewOpen));
    if (get(previewOpen)) set(activePaneValue, null);
  }
  function handleKeyDown(e) {
    if (e.key === "Escape" && get(actionsOpen) && !get(overflowOpen)) set(actionsOpen, false);
  }
  var div = root_532();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root10();
      var div_2 = child(div_1);
      var sp_icon = child(div_2);
      set_custom_element_data(sp_icon, "name", "user-plus");
      set_custom_element_data(sp_icon, "size", "48");
      set_custom_element_data(sp_icon, "data-widget-part", "messages.join-icon");
      next(4);
      reset(div_2);
      var button = sibling(div_2, 2);
      var sp_icon_1 = child(button);
      set_custom_element_data(sp_icon_1, "name", "user-plus");
      set_custom_element_data(sp_icon_1, "size", "20");
      next();
      reset(button);
      reset(div_1);
      delegated("click", button, () => void conv.request("add-persona", {}));
      append($$anchor2, div_1);
    };
    var alternate_6 = ($$anchor2) => {
      var fragment = root_522();
      var sp_host_view = first_child(fragment);
      set_custom_element_data(sp_host_view, "name", "run-progress");
      var div_3 = sibling(sp_host_view, 2);
      var div_4 = child(div_3);
      var node_1 = child(div_4);
      {
        var consequent_1 = ($$anchor3) => {
          var button_1 = root_119();
          var sp_icon_2 = sibling(child(button_1), 2);
          set_custom_element_data(sp_icon_2, "name", "chevron-down");
          set_custom_element_data(sp_icon_2, "size", "12");
          set_custom_element_data(sp_icon_2, "data-widget-part", "messages.composer-actions-chevron");
          reset(button_1);
          template_effect(() => {
            set_attribute(button_1, "aria-expanded", get(actionsOpen));
            set_attribute(button_1, "aria-controls", actionsId);
          });
          delegated("click", button_1, () => set(actionsOpen, !get(actionsOpen)));
          append($$anchor3, button_1);
        };
        if_block(node_1, ($$render) => {
          if (get(actionsLabelShown)) $$render(consequent_1);
        });
      }
      var node_2 = sibling(node_1, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_5 = root_216();
          var sp_host_view_1 = child(div_5);
          set_custom_element_data(sp_host_view_1, "name", "retrieval-notice");
          reset(div_5);
          append($$anchor3, div_5);
        };
        if_block(node_2, ($$render) => {
          if (get(ragVisible)) $$render(consequent_2);
        });
      }
      reset(div_4);
      var node_3 = sibling(div_4, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var div_6 = root_97();
          var div_7 = child(div_6);
          var node_4 = child(div_7);
          {
            var consequent_3 = ($$anchor4) => {
              var sp_host_view_2 = root_311();
              set_custom_element_data(sp_host_view_2, "name", "session-controls");
              template_effect(() => set_custom_element_data(sp_host_view_2, "channel", conv.lane.current));
              append($$anchor4, sp_host_view_2);
            };
            if_block(node_4, ($$render) => {
              if (get(turnControls)) $$render(consequent_3);
            });
          }
          var node_5 = sibling(node_4, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var sp_host_view_3 = root_311();
              set_custom_element_data(sp_host_view_3, "name", "session-actions");
              template_effect(() => set_custom_element_data(sp_host_view_3, "channel", conv.lane.current));
              append($$anchor4, sp_host_view_3);
            };
            if_block(node_5, ($$render) => {
              if (get(actionsListed)) $$render(consequent_4);
            });
          }
          var node_6 = sibling(node_5, 2);
          {
            var consequent_8 = ($$anchor4) => {
              var sp_menu = root_87();
              set_custom_element_data(sp_menu, "placement", "top-start");
              set_custom_element_data(sp_menu, "label", "More actions");
              template_effect(() => set_custom_element_data(sp_menu, "open", get(overflowOpen)));
              var button_2 = child(sp_menu);
              var sp_icon_3 = child(button_2);
              set_custom_element_data(sp_icon_3, "name", "ellipsis");
              set_custom_element_data(sp_icon_3, "size", "14");
              var node_7 = sibling(sp_icon_3, 2);
              {
                var consequent_5 = ($$anchor5) => {
                  var span = root_49();
                  append($$anchor5, span);
                };
                if_block(node_7, ($$render) => {
                  if (get(overflowNew).length) $$render(consequent_5);
                });
              }
              reset(button_2);
              var node_8 = sibling(button_2, 2);
              each(node_8, 17, () => get(overflowActions), (a) => actionIdentity(a), ($$anchor5, a) => {
                const iconName = user_derived(() => get(a).icon || "play");
                const row = user_derived(() => paletteRowState(overflowRow(get(a)), { generating: get(isGenerating), newest: get(newestItem) }));
                var sp_menu_item = root_78();
                template_effect(($0) => set_custom_element_data(sp_menu_item, "value", $0), [() => actionIdentity(get(a))]);
                template_effect(() => set_custom_element_data(sp_menu_item, "disabled", get(row).disabled));
                set_custom_element_data(sp_menu_item, "data-widget-part", "messages.composer-overflow-item");
                var sp_icon_4 = child(sp_menu_item);
                template_effect(() => set_custom_element_data(sp_icon_4, "name", get(iconName)));
                set_custom_element_data(sp_icon_4, "size", "12");
                var span_1 = sibling(sp_icon_4, 2);
                var text_1 = child(span_1);
                var span_2 = sibling(text_1);
                var text_2 = child(span_2);
                reset(span_2);
                var node_9 = sibling(span_2, 2);
                {
                  var consequent_6 = ($$anchor6) => {
                    var span_3 = root_58();
                    var text_3 = child(span_3, true);
                    reset(span_3);
                    template_effect(() => set_text(text_3, get(row).reason));
                    append($$anchor6, span_3);
                  };
                  if_block(node_9, ($$render) => {
                    if (get(row).reason) $$render(consequent_6);
                  });
                }
                reset(span_1);
                var node_10 = sibling(span_1, 2);
                {
                  var consequent_7 = ($$anchor6) => {
                    var span_4 = root_68();
                    append($$anchor6, span_4);
                  };
                  if_block(node_10, ($$render) => {
                    if (get(a).isNew) $$render(consequent_7);
                  });
                }
                reset(sp_menu_item);
                template_effect(() => {
                  set_attribute(span_1, "title", get(a).description);
                  set_text(text_1, `${get(a).name ?? ""} `);
                  set_text(text_2, `/${get(a).slash ?? ""}`);
                });
                append($$anchor5, sp_menu_item);
              });
              reset(sp_menu);
              template_effect(() => set_attribute(button_2, "aria-label", get(overflowNew).length ? `More actions (${get(overflowNew).length} new)` : "More actions"));
              event("open-change", sp_menu, (e) => handleOverflowOpen(e.detail.open));
              event("select", sp_menu, (e) => {
                const a = get(overflowActions).find((x) => actionIdentity(x) === e.detail.value);
                if (a) conv.invoke(actionIdentity(a));
              });
              append($$anchor4, sp_menu);
            };
            if_block(node_6, ($$render) => {
              if (get(overflowActions).length) $$render(consequent_8);
            });
          }
          reset(div_7);
          reset(div_6);
          template_effect(() => set_attribute(div_6, "id", actionsId));
          append($$anchor3, div_6);
        };
        if_block(node_3, ($$render) => {
          if (get(actionsLabelShown) && get(actionsOpen)) $$render(consequent_9);
        });
      }
      reset(div_3);
      var sp_drop_zone = sibling(div_3, 2);
      set_custom_element_data(sp_drop_zone, "data-widget-part", "messages.composer-drop");
      set_custom_element_data(sp_drop_zone, "label", "Drop to attach");
      template_effect(() => set_custom_element_data(sp_drop_zone, "disabled", !get(offersAttachments)));
      var div_8 = child(sp_drop_zone);
      var node_11 = child(div_8);
      {
        var consequent_10 = ($$anchor3) => {
          var div_9 = root_105();
          set_attribute(div_9, "aria-valuemin", 0);
          set_attribute(div_9, "aria-valuemax", 100);
          var div_10 = child(div_9);
          reset(div_9);
          template_effect(
            ($0, $1) => {
              set_attribute(div_9, "aria-valuenow", $0);
              set_attribute(div_10, "data-high", get(usageRatio) > 0.9 ? "" : void 0);
              set_style(div_10, `--sp-fill: ${$1 ?? ""}%`);
            },
            [
              () => Math.round(get(usageRatio) * 100),
              () => (get(usageRatio) * 100).toFixed(1)
            ]
          );
          append($$anchor3, div_9);
        };
        if_block(node_11, ($$render) => {
          if (get(usageRatio) !== null) $$render(consequent_10);
        });
      }
      var div_11 = sibling(node_11, 2);
      var node_12 = child(div_11);
      {
        var consequent_12 = ($$anchor3) => {
          var fragment_1 = root_125();
          var div_12 = first_child(fragment_1);
          var span_5 = child(div_12);
          var text_4 = child(span_5, true);
          reset(span_5);
          var node_13 = sibling(span_5, 2);
          {
            var consequent_11 = ($$anchor4) => {
              var button_3 = root_1110();
              var sp_icon_5 = child(button_3);
              set_custom_element_data(sp_icon_5, "name", "arrow-left");
              set_custom_element_data(sp_icon_5, "size", "14");
              next();
              reset(button_3);
              delegated("click", button_3, backToCompose);
              append($$anchor4, button_3);
            };
            if_block(node_13, ($$render) => {
              if (!get(hideCompose)) $$render(consequent_11);
            });
          }
          reset(div_12);
          var div_13 = sibling(div_12, 2);
          var sp_host_view_4 = child(div_13);
          template_effect(() => set_custom_element_data(sp_host_view_4, "name", get(activePane).view));
          reset(div_13);
          template_effect(() => {
            set_text(text_4, get(activePane).title);
            set_attribute(div_13, "aria-label", `${get(activePane).title ?? ""} panel`);
          });
          append($$anchor3, fragment_1);
        };
        var consequent_13 = ($$anchor3) => {
          var div_14 = root_135();
          var sp_message_body = child(div_14);
          template_effect(() => set_custom_element_data(sp_message_body, "text", get(draft)));
          reset(div_14);
          append($$anchor3, div_14);
        };
        var consequent_18 = ($$anchor3) => {
          var fragment_2 = root_183();
          var node_14 = first_child(fragment_2);
          {
            var consequent_17 = ($$anchor4) => {
              var ul = root_174();
              each(ul, 23, () => get(paletteRows), (a) => a.slash, ($$anchor5, a, i) => {
                const iconName = user_derived(() => get(a).icon || "play");
                const rowState = user_derived(() => paletteRowState(get(a), { generating: get(isGenerating), newest: get(newestItem) }));
                const argHint = user_derived(() => slashArgumentHint(get(a)));
                var li = root_164();
                var button_4 = child(li);
                var sp_icon_6 = child(button_4);
                template_effect(() => set_custom_element_data(sp_icon_6, "name", get(iconName)));
                set_custom_element_data(sp_icon_6, "size", "14");
                var span_6 = sibling(sp_icon_6, 2);
                var text_5 = child(span_6);
                reset(span_6);
                var node_15 = sibling(span_6, 2);
                {
                  var consequent_14 = ($$anchor6) => {
                    var span_7 = root_144();
                    var text_6 = child(span_7, true);
                    reset(span_7);
                    template_effect(() => set_text(text_6, get(argHint)));
                    append($$anchor6, span_7);
                  };
                  if_block(node_15, ($$render) => {
                    if (get(argHint)) $$render(consequent_14);
                  });
                }
                var span_8 = sibling(node_15, 2);
                var text_7 = child(span_8, true);
                reset(span_8);
                var node_16 = sibling(span_8, 2);
                {
                  var consequent_15 = ($$anchor6) => {
                    var span_9 = root_68();
                    append($$anchor6, span_9);
                  };
                  if_block(node_16, ($$render) => {
                    if (get(a).isNew) $$render(consequent_15);
                  });
                }
                var node_17 = sibling(node_16, 2);
                {
                  var consequent_16 = ($$anchor6) => {
                    var span_10 = root_154();
                    var text_8 = child(span_10, true);
                    reset(span_10);
                    template_effect(() => set_text(text_8, get(rowState).reason));
                    append($$anchor6, span_10);
                  };
                  if_block(node_17, ($$render) => {
                    if (get(rowState).reason) $$render(consequent_16);
                  });
                }
                reset(button_4);
                reset(li);
                template_effect(
                  ($0) => {
                    set_attribute(li, "id", $0);
                    set_attribute(li, "aria-selected", get(i) === get(paletteHighlight));
                    set_attribute(li, "aria-disabled", get(rowState).disabled);
                    button_4.disabled = get(rowState).disabled;
                    set_text(text_5, `/${get(a).slash ?? ""}`);
                    set_text(text_7, get(a).name);
                  },
                  [() => paletteOptionId(get(i))]
                );
                delegated("mousedown", button_4, (e) => e.preventDefault());
                event("mouseenter", button_4, () => set(paletteHighlight, get(i), true));
                delegated("click", button_4, () => invokePalette(get(a)));
                append($$anchor5, li);
              });
              reset(ul);
              template_effect(() => set_attribute(ul, "id", paletteId));
              append($$anchor4, ul);
            };
            if_block(node_14, ($$render) => {
              if (get(paletteOpen)) $$render(consequent_17);
            });
          }
          var sp_composer_field = sibling(node_14, 2);
          set_custom_element_data(sp_composer_field, "data-widget-part", "messages.composer-field");
          set_custom_element_data(sp_composer_field, "rows", "1");
          set_custom_element_data(sp_composer_field, "label", "Write a message");
          template_effect(() => set_custom_element_data(sp_composer_field, "placeholder", get(placeholder)));
          template_effect(() => set_custom_element_data(sp_composer_field, "submit-on", get(submitOnEnter) ? "enter" : "none"));
          template_effect(() => set_custom_element_data(sp_composer_field, "keys", get(capturedKeys)));
          set_custom_element_data(sp_composer_field, "spellcheck", "true");
          template_effect(() => set_custom_element_data(sp_composer_field, "aria-describedby", get(contextExceeded) ? warningId : void 0));
          template_effect(() => set_custom_element_data(sp_composer_field, "aria-invalid", get(contextExceeded) ? "true" : void 0));
          template_effect(() => set_custom_element_data(sp_composer_field, "aria-autocomplete", get(paletteActions).length ? "list" : void 0));
          template_effect(() => set_custom_element_data(sp_composer_field, "aria-controls", get(paletteOpen) ? paletteId : void 0));
          template_effect(($0) => set_custom_element_data(sp_composer_field, "aria-activedescendant", $0), [
            () => get(paletteOpen) && get(paletteHighlight) >= 0 ? paletteOptionId(get(paletteHighlight)) : void 0
          ]);
          attach(sp_composer_field, () => writeField);
          delegated("input", sp_composer_field, (e) => set(draft, e.detail.value, true));
          event("submit", sp_composer_field, (e) => {
            set(draft, e.detail.value, true);
            send();
          });
          event("key", sp_composer_field, handleFieldKey);
          event("focus", sp_composer_field, handleFieldFocus);
          append($$anchor3, fragment_2);
        };
        if_block(node_12, ($$render) => {
          if (get(activePane)) $$render(consequent_12);
          else if (get(previewOpen)) $$render(consequent_13, 1);
          else if (!get(hideCompose)) $$render(consequent_18, 2);
        });
      }
      reset(div_11);
      var node_18 = sibling(div_11, 2);
      {
        var consequent_22 = ($$anchor3) => {
          var ul_1 = root_253();
          var node_19 = child(ul_1);
          each(node_19, 17, () => get(tray), (t) => t.id, ($$anchor4, t) => {
            var li_1 = root_234();
            var node_20 = child(li_1);
            {
              var consequent_19 = ($$anchor5) => {
                var img = root_193();
                template_effect(() => set_attribute(img, "src", get(t).thumbSrc));
                append($$anchor5, img);
              };
              var alternate = ($$anchor5) => {
                var sp_icon_7 = root_203();
                set_custom_element_data(sp_icon_7, "data-widget-part", "messages.composer-tray-icon");
                template_effect(() => set_custom_element_data(sp_icon_7, "name", get(t).kind === "image" ? "image" : "file-text"));
                set_custom_element_data(sp_icon_7, "size", "20");
                append($$anchor5, sp_icon_7);
              };
              if_block(node_20, ($$render) => {
                if (get(t).thumbSrc) $$render(consequent_19);
                else $$render(alternate, -1);
              });
            }
            var span_11 = sibling(node_20, 2);
            var text_9 = child(span_11, true);
            reset(span_11);
            var node_21 = sibling(span_11, 2);
            {
              var consequent_20 = ($$anchor5) => {
                var span_12 = root_217();
                set_attribute(span_12, "aria-valuemin", 0);
                set_attribute(span_12, "aria-valuemax", 100);
                template_effect(
                  ($0, $1) => {
                    set_attribute(span_12, "aria-label", `Uploading ${get(t).filename ?? ""}`);
                    set_attribute(span_12, "aria-valuenow", $0);
                    set_style(span_12, `--sp-fill: ${$1 ?? ""}%`);
                  },
                  [() => progressOf(get(t)), () => progressOf(get(t))]
                );
                append($$anchor5, span_12);
              };
              var consequent_21 = ($$anchor5) => {
                var span_13 = root_224();
                var text_10 = child(span_13, true);
                reset(span_13);
                template_effect(() => set_text(text_10, get(t).refusal ?? "Not attached."));
                append($$anchor5, span_13);
              };
              if_block(node_21, ($$render) => {
                if (get(t).status === "uploading") $$render(consequent_20);
                else if (get(t).status === "refused") $$render(consequent_21, 1);
              });
            }
            var button_5 = sibling(node_21, 2);
            var sp_icon_8 = child(button_5);
            set_custom_element_data(sp_icon_8, "name", "x");
            set_custom_element_data(sp_icon_8, "size", "12");
            reset(button_5);
            reset(li_1);
            template_effect(() => {
              set_attribute(li_1, "data-status", get(t).status);
              set_attribute(li_1, "data-kind", get(t).kind ?? void 0);
              set_attribute(span_11, "title", get(t).filename);
              set_text(text_9, get(t).filename);
              set_attribute(button_5, "aria-label", `Remove ${get(t).filename ?? ""}`);
            });
            delegated("click", button_5, () => removeTrayItem(get(t)));
            append($$anchor4, li_1);
          });
          var node_22 = sibling(node_19, 2);
          each(node_22, 17, () => get(refusedHere), (r) => r.key, ($$anchor4, r) => {
            var li_2 = root_243();
            var sp_icon_9 = child(li_2);
            set_custom_element_data(sp_icon_9, "data-widget-part", "messages.composer-tray-icon");
            set_custom_element_data(sp_icon_9, "name", "ban");
            set_custom_element_data(sp_icon_9, "size", "20");
            var span_14 = sibling(sp_icon_9, 2);
            var text_11 = child(span_14, true);
            reset(span_14);
            var span_15 = sibling(span_14, 2);
            var text_12 = child(span_15, true);
            reset(span_15);
            reset(li_2);
            template_effect(() => {
              set_attribute(span_14, "title", get(r).filename);
              set_text(text_11, get(r).filename);
              set_text(text_12, get(r).reason);
            });
            append($$anchor4, li_2);
          });
          reset(ul_1);
          append($$anchor3, ul_1);
        };
        if_block(node_18, ($$render) => {
          if (get(offersAttachments) && (get(tray).length || get(refusedHere).length)) $$render(consequent_22);
        });
      }
      var div_15 = sibling(node_18, 2);
      var node_23 = child(div_15);
      {
        var consequent_23 = ($$anchor3) => {
          var div_16 = root_273();
          each(div_16, 20, () => get(channels), (slug) => slug, ($$anchor4, slug) => {
            var button_6 = root_263();
            var text_13 = child(button_6, true);
            reset(button_6);
            template_effect(
              ($0, $1) => {
                set_attribute(button_6, "aria-pressed", slug === conv.lane.current);
                set_attribute(button_6, "title", `Write on ${$0 ?? ""}`);
                set_text(text_13, $1);
              },
              [() => channelLabel(slug), () => channelLabel(slug)]
            );
            delegated("click", button_6, () => conv.lane.set(slug));
            append($$anchor4, button_6);
          });
          reset(div_16);
          append($$anchor3, div_16);
        };
        if_block(node_23, ($$render) => {
          if (get(channels).length > 1) $$render(consequent_23);
        });
      }
      var node_24 = sibling(node_23, 2);
      {
        var consequent_25 = ($$anchor3) => {
          var fragment_3 = comment();
          var node_25 = first_child(fragment_3);
          {
            var consequent_24 = ($$anchor4) => {
              var sp_popover = root_293();
              set_custom_element_data(sp_popover, "placement", "top-start");
              template_effect(() => set_custom_element_data(sp_popover, "open", get(personaSwitcherOpen)));
              var button_7 = child(sp_popover);
              var sp_avatar = child(button_7);
              template_effect(() => set_custom_element_data(sp_avatar, "ref", `character:${get(activePersona).personaId}`));
              set_custom_element_data(sp_avatar, "size", "sm");
              var span_16 = sibling(sp_avatar, 2);
              var text_14 = child(span_16, true);
              reset(span_16);
              var sp_icon_10 = sibling(span_16, 2);
              set_custom_element_data(sp_icon_10, "name", "chevron-down");
              set_custom_element_data(sp_icon_10, "size", "14");
              reset(button_7);
              var div_17 = sibling(button_7, 2);
              var node_26 = sibling(child(div_17), 2);
              each(node_26, 17, () => get(c)?.personas ?? [], (p) => p.personaId, ($$anchor5, p) => {
                var button_8 = root_283();
                var sp_avatar_1 = child(button_8);
                template_effect(() => set_custom_element_data(sp_avatar_1, "ref", `character:${get(p).personaId}`));
                set_custom_element_data(sp_avatar_1, "size", "sm");
                var span_17 = sibling(sp_avatar_1, 2);
                var text_15 = child(span_17, true);
                reset(span_17);
                reset(button_8);
                template_effect(() => {
                  set_attribute(button_8, "aria-current", get(p).personaId === get(c)?.personaId ? "true" : void 0);
                  set_text(text_15, get(p).name);
                });
                delegated("click", button_8, () => {
                  void conv.request("switch-persona", { personaId: get(p).personaId });
                  set(personaSwitcherOpen, false);
                });
                append($$anchor5, button_8);
              });
              reset(div_17);
              reset(sp_popover);
              template_effect(() => {
                set_attribute(button_7, "aria-label", `Switch persona (currently ${get(activePersona).name ?? ""})`);
                set_text(text_14, get(activePersona).name);
              });
              event("open-change", sp_popover, (e) => set(personaSwitcherOpen, e.detail.open, true));
              append($$anchor4, sp_popover);
            };
            var alternate_1 = ($$anchor4) => {
              var span_18 = root_302();
              var sp_avatar_2 = child(span_18);
              template_effect(() => set_custom_element_data(sp_avatar_2, "ref", `character:${get(activePersona).personaId}`));
              set_custom_element_data(sp_avatar_2, "size", "sm");
              var span_19 = sibling(sp_avatar_2, 2);
              var text_16 = child(span_19, true);
              reset(span_19);
              reset(span_18);
              template_effect(() => set_text(text_16, get(activePersona).name));
              append($$anchor4, span_18);
            };
            if_block(node_25, ($$render) => {
              if (get(personaCount) > 1) $$render(consequent_24);
              else $$render(alternate_1, -1);
            });
          }
          append($$anchor3, fragment_3);
        };
        if_block(node_24, ($$render) => {
          if (get(activePersona)) $$render(consequent_25);
        });
      }
      var div_18 = sibling(node_24, 2);
      var node_27 = child(div_18);
      {
        var consequent_26 = ($$anchor3) => {
          var sp_file_picker = root_312();
          set_custom_element_data(sp_file_picker, "data-widget-part", "messages.composer-attach");
          template_effect(() => set_custom_element_data(sp_file_picker, "accept", get(pickerAccept) || void 0));
          set_custom_element_data(sp_file_picker, "multiple", true);
          var button_9 = child(sp_file_picker);
          var sp_icon_11 = child(button_9);
          set_custom_element_data(sp_icon_11, "name", "paperclip");
          set_custom_element_data(sp_icon_11, "size", "16");
          reset(button_9);
          reset(sp_file_picker);
          template_effect(() => set_attribute(button_9, "title", get(readersLine) ? `Attach files. ${get(readersLine)}` : "Attach files"));
          event("files", sp_file_picker, (e) => void attachFiles(e.detail.files));
          append($$anchor3, sp_file_picker);
        };
        if_block(node_27, ($$render) => {
          if (get(offersAttachments)) $$render(consequent_26);
        });
      }
      var node_28 = sibling(node_27, 2);
      {
        var consequent_27 = ($$anchor3) => {
          var button_10 = root_323();
          var sp_icon_12 = child(button_10);
          set_custom_element_data(sp_icon_12, "name", "eye");
          set_custom_element_data(sp_icon_12, "size", "16");
          reset(button_10);
          template_effect(() => set_attribute(button_10, "aria-pressed", get(previewOpen)));
          delegated("click", button_10, togglePreview);
          append($$anchor3, button_10);
        };
        if_block(node_28, ($$render) => {
          if (!get(hideCompose)) $$render(consequent_27);
        });
      }
      var node_29 = sibling(node_28, 2);
      {
        var consequent_29 = ($$anchor3) => {
          var sp_popover_1 = root_353();
          set_custom_element_data(sp_popover_1, "placement", "top-end");
          template_effect(() => set_custom_element_data(sp_popover_1, "open", get(moreMenuOpen)));
          var button_11 = child(sp_popover_1);
          var sp_icon_13 = child(button_11);
          set_custom_element_data(sp_icon_13, "name", "ellipsis-vertical");
          set_custom_element_data(sp_icon_13, "size", "16");
          reset(button_11);
          var div_19 = sibling(button_11, 2);
          var header = child(div_19);
          var sp_icon_14 = child(header);
          set_custom_element_data(sp_icon_14, "name", "ellipsis-vertical");
          set_custom_element_data(sp_icon_14, "size", "16");
          next(2);
          reset(header);
          var div_20 = sibling(header, 2);
          var node_30 = child(div_20);
          each(node_30, 17, () => get(morePanes), (pane) => pane.view, ($$anchor4, pane) => {
            var button_12 = root_333();
            var sp_icon_15 = child(button_12);
            template_effect(() => set_custom_element_data(sp_icon_15, "name", get(pane).icon));
            set_custom_element_data(sp_icon_15, "size", "12");
            var span_20 = sibling(sp_icon_15, 2);
            var text_17 = child(span_20, true);
            reset(span_20);
            reset(button_12);
            template_effect(() => {
              set_attribute(button_12, "data-current", get(activePaneValue) === get(pane).view ? "" : void 0);
              set_text(text_17, get(pane).title);
            });
            delegated("click", button_12, () => openPane(get(pane).view));
            append($$anchor4, button_12);
          });
          var node_31 = sibling(node_30, 2);
          {
            var consequent_28 = ($$anchor4) => {
              var button_13 = root_343();
              var sp_icon_16 = child(button_13);
              set_custom_element_data(sp_icon_16, "name", "paperclip");
              set_custom_element_data(sp_icon_16, "size", "12");
              next(2);
              reset(button_13);
              delegated("click", button_13, openReaders);
              append($$anchor4, button_13);
            };
            if_block(node_31, ($$render) => {
              if (get(readersOffered)) $$render(consequent_28);
            });
          }
          reset(div_20);
          reset(div_19);
          reset(sp_popover_1);
          template_effect(() => set_attribute(button_11, "data-active", get(activePane) ? "" : void 0));
          event("open-change", sp_popover_1, (e) => set(moreMenuOpen, e.detail.open, true));
          append($$anchor3, sp_popover_1);
        };
        if_block(node_29, ($$render) => {
          if (get(morePanes).length > 0 || get(readersOffered)) $$render(consequent_29);
        });
      }
      var node_32 = sibling(node_29, 2);
      {
        var consequent_31 = ($$anchor3) => {
          var fragment_4 = comment();
          var node_33 = first_child(fragment_4);
          {
            var consequent_30 = ($$anchor4) => {
              var button_14 = root_363();
              var sp_icon_17 = child(button_14);
              set_custom_element_data(sp_icon_17, "name", "square");
              next(2);
              reset(button_14);
              delegated("click", button_14, () => conv.invoke("stop"));
              append($$anchor4, button_14);
            };
            var alternate_2 = ($$anchor4) => {
              var button_15 = root_373();
              var sp_icon_18 = child(button_15);
              set_custom_element_data(sp_icon_18, "name", "send");
              next(2);
              reset(button_15);
              template_effect(
                ($0) => {
                  set_attribute(button_15, "data-someone-due", get(sendTonal) ? "" : void 0);
                  button_15.disabled = $0;
                },
                [() => !get(draft).trim() && !get(hasAttachments)]
              );
              delegated("click", button_15, send);
              append($$anchor4, button_15);
            };
            if_block(node_33, ($$render) => {
              if (get(isGenerating)) $$render(consequent_30);
              else $$render(alternate_2, -1);
            });
          }
          append($$anchor3, fragment_4);
        };
        if_block(node_32, ($$render) => {
          if (!get(hideCompose)) $$render(consequent_31);
        });
      }
      reset(div_18);
      reset(div_15);
      reset(div_8);
      reset(sp_drop_zone);
      var node_34 = sibling(sp_drop_zone, 2);
      {
        var consequent_32 = ($$anchor3) => {
          var p_1 = root_382();
          var text_18 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_18, get(announcement)));
          append($$anchor3, p_1);
        };
        if_block(node_34, ($$render) => {
          if (get(offersAttachments)) $$render(consequent_32);
        });
      }
      var node_35 = sibling(node_34, 2);
      {
        var consequent_35 = ($$anchor3) => {
          var sp_dialog = root_442();
          set_custom_element_data(sp_dialog, "label", "What can be attached");
          template_effect(() => set_custom_element_data(sp_dialog, "open", get(readersOpen)));
          var div_21 = sibling(child(sp_dialog), 2);
          var p_2 = child(div_21);
          var text_19 = child(p_2, true);
          reset(p_2);
          var ul_2 = sibling(p_2, 2);
          each(ul_2, 20, () => ATTACHMENT_KINDS_V1, (k) => k, ($$anchor4, k) => {
            const v = user_derived(() => get(readers)?.kinds[k]);
            var li_3 = root_41();
            var strong = child(li_3);
            var text_20 = child(strong, true);
            reset(strong);
            var span_21 = sibling(strong, 2);
            var text_21 = child(span_21);
            reset(span_21);
            var node_36 = sibling(span_21, 2);
            {
              var consequent_33 = ($$anchor5) => {
                var span_22 = root_392();
                append($$anchor5, span_22);
              };
              var alternate_3 = ($$anchor5) => {
                var span_23 = root_402();
                var text_22 = child(span_23);
                reset(span_23);
                template_effect(() => set_text(text_22, `\u2014 can't be attached. ${get(v)?.reason ?? "" ?? ""}`));
                append($$anchor5, span_23);
              };
              if_block(node_36, ($$render) => {
                if (get(v)?.allowed) $$render(consequent_33);
                else $$render(alternate_3, -1);
              });
            }
            reset(li_3);
            template_effect(() => {
              set_attribute(li_3, "data-allowed", get(v)?.allowed ? "" : void 0);
              set_text(text_20, KIND_NAME[k]);
              set_text(text_21, `(${KIND_FORMATS[k] ?? ""})`);
            });
            append($$anchor4, li_3);
          });
          reset(ul_2);
          var node_37 = sibling(ul_2, 2);
          {
            var consequent_34 = ($$anchor4) => {
              var ul_3 = root_432();
              each(ul_3, 20, () => get(readerLines), (line) => line, ($$anchor5, line) => {
                var li_4 = root_422();
                var text_23 = child(li_4, true);
                reset(li_4);
                template_effect(() => set_text(text_23, line));
                append($$anchor5, li_4);
              });
              reset(ul_3);
              append($$anchor4, ul_3);
            };
            if_block(node_37, ($$render) => {
              if (get(readerLines).length) $$render(consequent_34);
            });
          }
          reset(div_21);
          reset(sp_dialog);
          template_effect(() => set_text(text_19, get(readersLine)));
          event("open-change", sp_dialog, (e) => set(readersOpen, e.detail.open, true));
          append($$anchor3, sp_dialog);
        };
        if_block(node_35, ($$render) => {
          if (get(readersOffered)) $$render(consequent_35);
        });
      }
      var node_38 = sibling(node_35, 2);
      {
        var consequent_36 = ($$anchor3) => {
          var p_3 = root_452();
          var text_24 = child(p_3);
          reset(p_3);
          template_effect(() => set_text(text_24, `${get(uploading) ?? ""} Sends when done.`));
          append($$anchor3, p_3);
        };
        if_block(node_38, ($$render) => {
          if (get(sendWaiting) && get(uploading)) $$render(consequent_36);
        });
      }
      var node_39 = sibling(node_38, 2);
      {
        var consequent_37 = ($$anchor3) => {
          var p_4 = root_462();
          template_effect(() => set_attribute(p_4, "id", warningId));
          append($$anchor3, p_4);
        };
        if_block(node_39, ($$render) => {
          if (get(contextExceeded)) $$render(consequent_37);
        });
      }
      var node_40 = sibling(node_39, 2);
      {
        var consequent_39 = ($$anchor3) => {
          var p_5 = root_482();
          var node_41 = sibling(child(p_5), 2);
          {
            var consequent_38 = ($$anchor4) => {
              var text_25 = text();
              template_effect(() => set_text(text_25, `runs /${get(paletteEnterPick).slash ?? ""}`));
              append($$anchor4, text_25);
            };
            var alternate_4 = ($$anchor4) => {
              var fragment_6 = root_472();
              next(4);
              append($$anchor4, fragment_6);
            };
            if_block(node_41, ($$render) => {
              if (get(paletteEnterPick)) $$render(consequent_38);
              else $$render(alternate_4, -1);
            });
          }
          next(3);
          reset(p_5);
          append($$anchor3, p_5);
        };
        var consequent_41 = ($$anchor3) => {
          var p_6 = root_50();
          var node_42 = child(p_6);
          {
            var consequent_40 = ($$anchor4) => {
              var text_26 = text();
              template_effect(() => set_text(text_26, `${get(slashRefusal) ?? ""}.`));
              append($$anchor4, text_26);
            };
            var alternate_5 = ($$anchor4) => {
              var fragment_8 = root_492();
              var kbd = first_child(fragment_8);
              var text_27 = child(kbd, true);
              reset(kbd);
              var text_28 = sibling(kbd);
              template_effect(() => {
                set_text(text_27, get(submitOnEnter) ? "Enter" : "Send");
                set_text(text_28, ` runs /${get(slashCommand).action.slash ?? ""} with your text.`);
              });
              append($$anchor4, fragment_8);
            };
            if_block(node_42, ($$render) => {
              if (get(slashRefusal)) $$render(consequent_40);
              else $$render(alternate_5, -1);
            });
          }
          reset(p_6);
          template_effect(() => set_attribute(p_6, "data-refused", get(slashRefusal) ? "" : void 0));
          append($$anchor3, p_6);
        };
        var consequent_42 = ($$anchor3) => {
          var p_7 = root_51();
          append($$anchor3, p_7);
        };
        if_block(node_40, ($$render) => {
          if (get(paletteOpen)) $$render(consequent_39);
          else if (get(slashCommand)) $$render(consequent_41, 1);
          else if (get(hintVisible) && get(submitOnEnter)) $$render(consequent_42, 2);
        });
      }
      event("files", sp_drop_zone, (e) => {
        if (e.target !== e.currentTarget) return;
        void attachFiles(e.detail.files);
      });
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(c)?.addPersona) $$render(consequent);
      else $$render(alternate_6, -1);
    });
  }
  reset(div);
  template_effect(() => {
    set_attribute(div, "data-composer-skin", composerSkin());
    set_attribute(div, "hidden", conv.edit.id !== null);
  });
  delegated("keydown", div, handleKeyDown);
  append($$anchor, div);
  pop();
}
delegate(["keydown", "click", "mousedown", "input"]);

// components/sessions/messages/NextCharacterBlock.svelte
var root11 = from_html(`<div data-widget-part="messages.next-up-waiting"><span data-widget-part="messages.next-up-text">Waiting for a message \u2014 or pick who speaks next</span> <button type="button" data-widget-part="messages.next-up-pick"><sp-icon></sp-icon> <span>Pick</span></button></div>`, 2);
var root_120 = from_html(`<sp-avatar></sp-avatar>`, 2);
var root_218 = from_html(`<sp-icon></sp-icon>`, 2);
var root_313 = from_html(`<button type="button" data-widget-part="messages.next-up-pick" title="Someone else" aria-label="Pick someone else to continue"><sp-icon></sp-icon> <span data-widget-part="messages.next-up-pick-label">Someone else</span></button>`, 2);
var root_410 = from_html(`<button type="button" data-widget-part="messages.next-up-continue" title="Continue"><sp-icon></sp-icon> <span>Continue</span></button>`, 2);
var root_59 = from_html(`<p data-widget-part="messages.next-up-after"> </p>`);
var root_69 = from_html(`<div data-widget-part="messages.next-up-head"><div data-widget-part="messages.next-up-line"><!> <span data-widget-part="messages.next-up-text"> </span> <div data-widget-part="messages.next-up-controls"><!> <!></div></div> <!></div>`);
function NextCharacterBlock($$anchor, $$props) {
  push($$props, true);
  let canChooseSomeoneElse = prop($$props, "canChooseSomeoneElse", 3, true), viewerUserId = prop($$props, "viewerUserId", 3, null);
  const conversation = useConversation();
  const channel = user_derived(() => conversation.lane.current || "main");
  const channelOf = (e) => typeof e.channel === "string" && e.channel ? e.channel : "main";
  const here = user_derived(() => $$props.order.filter((e) => channelOf(e) === get(channel)));
  const byRef = user_derived(() => new Map($$props.candidates.map((c) => [c.ref, c])));
  const head = user_derived(() => get(here)[0]);
  const nameOf = (ref) => {
    if (ref === null) return conversation.dossier?.turn.ownVoiceName || "The narrator";
    const c = get(byRef).get(ref);
    return c?.nickname || c?.name || "Someone";
  };
  const isPerson = (ref) => ref !== null && get(byRef).get(ref)?.kind === "persona";
  const headName = user_derived(() => get(head) ? nameOf(get(head).ref) : "");
  const headIsPerson = user_derived(() => !!get(head) && isPerson(get(head).ref));
  const headIsMine = user_derived(() => get(headIsPerson) && viewerUserId() != null && get(byRef).get(get(head).ref)?.ownerUserId === viewerUserId());
  const line = user_derived(() => get(headIsMine) ? "Your turn" : get(headIsPerson) ? `${get(headName)}'s turn` : `${get(headName)} is ready to continue`);
  const face = user_derived(() => get(head)?.ref ? $$props.avatarFor?.(get(head).ref) : void 0);
  const after = user_derived(() => $$props.mode === "list" ? get(here).slice(1) : []);
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root11();
      var button = sibling(child(div), 2);
      var sp_icon = child(button);
      set_custom_element_data(sp_icon, "name", "users");
      set_custom_element_data(sp_icon, "size", "14");
      next(2);
      reset(button);
      reset(div);
      delegated("click", button, function(...$$args) {
        $$props.onSomeoneElse?.apply(this, $$args);
      });
      append($$anchor2, div);
    };
    var consequent_6 = ($$anchor2) => {
      var div_1 = root_69();
      var div_2 = child(div_1);
      var node_1 = child(div_2);
      {
        var consequent_1 = ($$anchor3) => {
          var sp_avatar = root_120();
          template_effect(() => set_custom_element_data(sp_avatar, "ref", get(head).ref));
          set_custom_element_data(sp_avatar, "size", "sm");
          append($$anchor3, sp_avatar);
        };
        var consequent_2 = ($$anchor3) => {
          var sp_icon_1 = root_218();
          set_custom_element_data(sp_icon_1, "name", "book-open-text");
          set_custom_element_data(sp_icon_1, "size", "18");
          set_custom_element_data(sp_icon_1, "data-widget-part", "messages.next-up-narrator");
          append($$anchor3, sp_icon_1);
        };
        if_block(node_1, ($$render) => {
          if (get(face)) $$render(consequent_1);
          else if (get(head).ref === null) $$render(consequent_2, 1);
        });
      }
      var span = sibling(node_1, 2);
      var text3 = child(span, true);
      reset(span);
      var div_3 = sibling(span, 2);
      var node_2 = child(div_3);
      {
        var consequent_3 = ($$anchor3) => {
          var button_1 = root_313();
          var sp_icon_2 = child(button_1);
          set_custom_element_data(sp_icon_2, "name", "users");
          set_custom_element_data(sp_icon_2, "size", "14");
          next(2);
          reset(button_1);
          delegated("click", button_1, function(...$$args) {
            $$props.onSomeoneElse?.apply(this, $$args);
          });
          append($$anchor3, button_1);
        };
        if_block(node_2, ($$render) => {
          if (canChooseSomeoneElse()) $$render(consequent_3);
        });
      }
      var node_3 = sibling(node_2, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var button_2 = root_410();
          var sp_icon_3 = child(button_2);
          set_custom_element_data(sp_icon_3, "name", "play");
          next(2);
          reset(button_2);
          template_effect(() => set_attribute(button_2, "aria-label", `Continue with ${get(headName) ?? ""}`));
          delegated("click", button_2, () => $$props.onContinue(get(channel)));
          append($$anchor3, button_2);
        };
        if_block(node_3, ($$render) => {
          if (!get(headIsPerson)) $$render(consequent_4);
        });
      }
      reset(div_3);
      reset(div_2);
      var node_4 = sibling(div_2, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var p = root_59();
          var text_1 = child(p);
          reset(p);
          template_effect(($0) => set_text(text_1, `Then ${$0 ?? ""}`), [() => get(after).map((e) => nameOf(e.ref)).join(", ")]);
          append($$anchor3, p);
        };
        if_block(node_4, ($$render) => {
          if (get(after).length) $$render(consequent_5);
        });
      }
      reset(div_1);
      template_effect(() => set_text(text3, get(line)));
      append($$anchor2, div_1);
    };
    if_block(node, ($$render) => {
      if ($$props.shouldShow && !$$props.order.length && $$props.candidates.length) $$render(consequent);
      else if ($$props.shouldShow && get(head)) $$render(consequent_6, 1);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);

// components/sessions/messages/MessagesWidget.svelte
var CONVERSATION_DEFAULTS = {
  order: "oldest-first",
  composerSkin: "classic",
  composerPosition: "bottom",
  lineWidth: "full",
  showMessages: true,
  showComposer: true,
  showAvatars: true,
  showTimestamps: true,
  showSceneMarkers: true,
  nextUp: "head",
  showActions: true,
  channel: null
};
function pickEnum(raw, of, fallback) {
  return typeof raw === "string" && of.includes(raw) ? raw : fallback;
}
function pickBool(raw, fallback) {
  return typeof raw === "boolean" ? raw : fallback;
}
function readConversationSettings(raw) {
  const v = raw ?? {};
  const d = CONVERSATION_DEFAULTS;
  return {
    order: pickEnum(v.order, ["oldest-first", "newest-first"], d.order),
    composerSkin: pickEnum(v.composer, ["classic", "minimal", "writer", "quill"], d.composerSkin),
    composerPosition: pickEnum(v.composerPosition, ["bottom", "top"], d.composerPosition),
    lineWidth: pickEnum(v.lineWidth, ["full", "comfortable"], d.lineWidth),
    showMessages: pickBool(v.showMessages, d.showMessages),
    showComposer: pickBool(v.showComposer, d.showComposer),
    showAvatars: pickBool(v.showAvatars, d.showAvatars),
    showTimestamps: pickBool(v.showTimestamps, d.showTimestamps),
    showSceneMarkers: pickBool(v.showSceneMarkers, d.showSceneMarkers),
    // ⏳ `showNudge: false` was this setting before `nextUp` (A8).
    nextUp: pickEnum(v.nextUp, ["head", "list", "hidden"], v.showNudge === false ? "hidden" : d.nextUp),
    showActions: pickBool(v.showActions, d.showActions),
    channel: typeof v.channel === "string" && v.channel.trim() ? v.channel.trim() : d.channel
  };
}
var root12 = from_html(`<header data-widget-part="messages.channel-head"><sp-icon></sp-icon> <h2 data-widget-part="messages.channel-title"> </h2></header>`, 2);
var root_121 = from_html(`<div data-widget-part="messages.log"><!></div>`);
var root_219 = from_html(`<button data-widget-part="messages.summarize-scene messages.selection-button" title="Scene"><sp-icon></sp-icon> <span data-widget-part="messages.selection-button-label">Scene</span></button>`, 2);
var root_314 = from_html(`<div data-widget-part="messages.compose"><div data-widget-part="messages.compose-area"><div data-widget-part="messages.selection-bar toolbar"><span data-widget-part="messages.selection-count"> </span> <div data-widget-part="messages.selection-bulk"><button data-widget-part="messages.select-all messages.selection-button" title="Select all"><sp-icon></sp-icon> <span data-widget-part="messages.selection-button-label">Select all</span></button> <button data-widget-part="messages.select-none messages.selection-button" title="Select none"><sp-icon></sp-icon> <span data-widget-part="messages.selection-button-label">Select none</span></button></div> <div data-widget-part="messages.selection-finish"><button data-widget-part="messages.selection-cancel messages.selection-button" title="Cancel"><sp-icon></sp-icon> <span data-widget-part="messages.selection-button-label">Cancel</span></button> <!> <button data-widget-part="messages.summarize-world messages.selection-button" title="World lore"><sp-icon></sp-icon> <span data-widget-part="messages.selection-button-label">World lore</span></button> <button data-widget-part="messages.summarize-character messages.selection-button" title="Character lore"><sp-icon></sp-icon> <span data-widget-part="messages.selection-button-label">Character lore</span></button></div></div></div></div>`, 2);
var root_411 = from_html(`<div data-widget-part="messages.next-up"><!></div>`);
var root_510 = from_html(`<div data-widget-part="messages.read-only" role="status"><sp-icon></sp-icon> <div data-widget-part="messages.read-only-text"><p data-widget-part="messages.read-only-title">This session is read-only.</p> <p> </p></div></div>`, 2);
var root_610 = from_html(`<div data-widget-part="messages.compose"><sp-host-view></sp-host-view> <!> <div data-widget-part="messages.compose-area"><!></div></div>`, 2);
var root_79 = from_html(`<div data-widget-part="messages.root"><!> <!> <!></div>`);
function MessagesWidget($$anchor, $$props) {
  push($$props, true);
  const ctx = useWidgetContext();
  const conversation = ctx ? setConversation(createConversation(ctx)) : null;
  let askedToSelect = null;
  user_effect(() => {
    const n = conversation?.dossier?.selectForSummary ?? 0;
    if (askedToSelect !== null && n !== askedToSelect) conversation?.select.start();
    askedToSelect = n;
  });
  const selecting = user_derived(() => !!conversation?.select.active);
  const selectedCount = user_derived(() => conversation?.select.ids.size ?? 0);
  const selectable = user_derived(() => {
    const taken = new Set(conversation?.dossier?.scened ?? []);
    return (conversation?.rows ?? []).map((m) => m.id).filter((id) => !taken.has(id));
  });
  let settings = user_derived(() => readConversationSettings(ctx?.current.settings.v1));
  let lastSettingsKey = null;
  user_effect(() => {
    const next2 = get(settings);
    const key = JSON.stringify(next2);
    if (key === lastSettingsKey) return;
    lastSettingsKey = key;
    $$props.onSettings?.(next2);
  });
  var div = root_79();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var header = root12();
      var sp_icon = child(header);
      set_custom_element_data(sp_icon, "name", "messages-square");
      set_custom_element_data(sp_icon, "size", "16");
      set_custom_element_data(sp_icon, "data-widget-part", "messages.channel-icon");
      var h2 = sibling(sp_icon, 2);
      var text3 = child(h2, true);
      reset(h2);
      reset(header);
      template_effect(($0) => set_text(text3, $0), [() => conversation.channelName(get(settings).channel)]);
      append($$anchor2, header);
    };
    if_block(node, ($$render) => {
      if (get(settings).channel && conversation) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_1 = root_121();
      var node_2 = child(div_1);
      {
        var consequent_1 = ($$anchor3) => {
          SessionContainer($$anchor3, {
            get order() {
              return get(settings).order;
            },
            get showSceneMarkers() {
              return get(settings).showSceneMarkers;
            }
          });
        };
        if_block(node_2, ($$render) => {
          if (conversation) $$render(consequent_1);
        });
      }
      reset(div_1);
      append($$anchor2, div_1);
    };
    if_block(node_1, ($$render) => {
      if (get(settings).showMessages) $$render(consequent_2);
    });
  }
  var node_3 = sibling(node_1, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_2 = root_314();
      var div_3 = child(div_2);
      var div_4 = child(div_3);
      var span = child(div_4);
      var text_1 = child(span);
      reset(span);
      var div_5 = sibling(span, 2);
      var button = child(div_5);
      var sp_icon_1 = child(button);
      set_custom_element_data(sp_icon_1, "name", "check-square");
      set_custom_element_data(sp_icon_1, "size", "16");
      next(2);
      reset(button);
      var button_1 = sibling(button, 2);
      var sp_icon_2 = child(button_1);
      set_custom_element_data(sp_icon_2, "name", "square");
      set_custom_element_data(sp_icon_2, "size", "16");
      next(2);
      reset(button_1);
      reset(div_5);
      var div_6 = sibling(div_5, 2);
      var button_2 = child(div_6);
      var sp_icon_3 = child(button_2);
      set_custom_element_data(sp_icon_3, "name", "x");
      set_custom_element_data(sp_icon_3, "size", "16");
      next(2);
      reset(button_2);
      var node_4 = sibling(button_2, 2);
      {
        var consequent_3 = ($$anchor3) => {
          var button_3 = root_219();
          var sp_icon_4 = child(button_3);
          set_custom_element_data(sp_icon_4, "name", "film");
          set_custom_element_data(sp_icon_4, "size", "16");
          next(2);
          reset(button_3);
          template_effect(() => button_3.disabled = get(selectedCount) === 0);
          delegated("click", button_3, () => conversation.select.commit("scene"));
          append($$anchor3, button_3);
        };
        if_block(node_4, ($$render) => {
          if (conversation.dossier?.writes.scenes) $$render(consequent_3);
        });
      }
      var button_4 = sibling(node_4, 2);
      var sp_icon_5 = child(button_4);
      set_custom_element_data(sp_icon_5, "name", "globe");
      set_custom_element_data(sp_icon_5, "size", "16");
      next(2);
      reset(button_4);
      var button_5 = sibling(button_4, 2);
      var sp_icon_6 = child(button_5);
      set_custom_element_data(sp_icon_6, "name", "user");
      set_custom_element_data(sp_icon_6, "size", "16");
      next(2);
      reset(button_5);
      reset(div_6);
      reset(div_4);
      reset(div_3);
      reset(div_2);
      template_effect(() => {
        set_text(text_1, `${get(selectedCount) ?? ""}
						${get(selectedCount) === 1 ? "message" : "messages"} selected`);
        button_4.disabled = get(selectedCount) === 0;
        button_5.disabled = get(selectedCount) === 0;
      });
      delegated("click", button, () => conversation.select.set(get(selectable)));
      delegated("click", button_1, () => conversation.select.set([]));
      delegated("click", button_2, () => conversation.select.stop());
      delegated("click", button_4, () => conversation.select.commit("world"));
      delegated("click", button_5, () => conversation.select.commit("character"));
      append($$anchor2, div_2);
    };
    var consequent_7 = ($$anchor2) => {
      const dossier = user_derived(() => conversation.dossier);
      var div_7 = root_610();
      var sp_host_view = child(div_7);
      set_custom_element_data(sp_host_view, "name", "session-banners");
      var node_5 = sibling(sp_host_view, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var div_8 = root_411();
          var node_6 = child(div_8);
          {
            let $0 = user_derived(() => get(dossier).turn.show && conversation.edit.id === null);
            NextCharacterBlock(node_6, {
              get order() {
                return get(dossier).turn.order;
              },
              get candidates() {
                return get(dossier).turn.candidates;
              },
              get mode() {
                return get(settings).nextUp;
              },
              get shouldShow() {
                return get($0);
              },
              avatarFor: (ref) => ref.startsWith("character:") ? ref : void 0,
              get canChooseSomeoneElse() {
                return get(dossier).turn.canChoose;
              },
              get viewerUserId() {
                return conversation.ctx.viewer.v1.userId;
              },
              onContinue: (channel) => void conversation.request("fire-turn", { channel }),
              onSomeoneElse: () => void conversation.request("pick-turn", {})
            });
          }
          reset(div_8);
          append($$anchor3, div_8);
        };
        if_block(node_5, ($$render) => {
          if (get(settings).nextUp !== "hidden" && get(dossier) && !get(dossier).readOnly) $$render(consequent_5);
        });
      }
      var div_9 = sibling(node_5, 2);
      var node_7 = child(div_9);
      {
        var consequent_6 = ($$anchor3) => {
          var div_10 = root_510();
          var sp_icon_7 = child(div_10);
          set_custom_element_data(sp_icon_7, "name", "lock");
          set_custom_element_data(sp_icon_7, "size", "20");
          set_custom_element_data(sp_icon_7, "data-widget-part", "messages.read-only-icon");
          var div_11 = sibling(sp_icon_7, 2);
          var p = sibling(child(div_11), 2);
          var text_2 = child(p);
          reset(p);
          reset(div_11);
          reset(div_10);
          template_effect(() => set_text(text_2, `Its mode (${get(dossier).readOnly.genreId ?? ""}) is not installed. Messages are safe to
								read; new turns resume when the mode returns.`));
          append($$anchor3, div_10);
        };
        var alternate = ($$anchor3) => {
          SessionComposer($$anchor3, {
            get composerSkin() {
              return get(settings).composerSkin;
            },
            get showActions() {
              return get(settings).showActions;
            }
          });
        };
        if_block(node_7, ($$render) => {
          if (get(dossier)?.readOnly) $$render(consequent_6);
          else $$render(alternate, -1);
        });
      }
      reset(div_9);
      reset(div_7);
      append($$anchor2, div_7);
    };
    if_block(node_3, ($$render) => {
      if (get(selecting) && conversation) $$render(consequent_4);
      else if (get(settings).showComposer && conversation) $$render(consequent_7, 1);
    });
  }
  reset(div);
  template_effect(() => {
    set_attribute(div, "data-order", get(settings).order);
    set_attribute(div, "data-composer-position", get(settings).composerPosition);
    set_attribute(div, "data-composer-skin", get(settings).composerSkin);
    set_attribute(div, "data-line-width", get(settings).lineWidth);
    set_attribute(div, "data-show-messages", get(settings).showMessages);
    set_attribute(div, "data-show-avatars", get(settings).showAvatars);
    set_attribute(div, "data-show-timestamps", get(settings).showTimestamps);
    set_attribute(div, "data-show-scene-markers", get(settings).showSceneMarkers);
    set_attribute(div, "data-channel", get(settings).channel ?? void 0);
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);

// components/sessions/messages/Messages.svelte
function Messages($$anchor, $$props) {
  push($$props, true);
  setContext(WIDGET_CONTEXT_KEY, widgetRefFromComponent(untrack(() => $$props.ctx), { id: "messages", instanceId: "messages", title: "Messages" }));
  MessagesWidget($$anchor, {});
  pop();
}

// components/sessions/messages/messages.ts
var messages_default = svelteComponent(Messages);
export {
  messages_default as default
};
