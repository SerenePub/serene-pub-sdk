/**
 * The host-element vocabulary (§3.5, R17, R22): every element a component
 * may place, with the attributes it takes, the events it raises and the
 * named slots it fills. A component runs in the page's UI worker and the
 * host mirrors what it renders into the widget box; **this table is the
 * allowlist the host's receiver enforces**, so an element, attribute or
 * event not listed here never reaches the page.
 *
 * Two families:
 *
 * - **plain elements** — the HTML a widget lays text out with. Each takes
 *   `class` (scoped by the widget-CSS rule, like every widget's). `href` must
 *   be `https:` or a fragment and opens in a new tab only (`target="_blank"`;
 *   the host sets `rel="noopener noreferrer"` itself); `src` is the app's own
 *   media or the plugin's own files — never another host, because an image
 *   URL is a request the page makes, and a remote's only path out is its
 *   plugin's own server-side actions.
 * - **`sp-*` sp elements** — elements the HOST renders, with its own components:
 *   one per piece of behaviour a widget needs and cannot fake from plain
 *   elements (a positioned popover, a menu, a dialog, tabs, form controls
 *   that keep the caret on the page, markdown that streams, a scroll that
 *   sticks to the bottom, a real document for a charting library).
 *
 * **Sp elements are unopinionated about style (R22).** An sp element renders the markup
 * its behaviour needs and the structural hooks a skin targets — `.sp-<name>`
 * on its root and the parts named in its `parts` — and no colour, radius or
 * spacing beyond what the behaviour requires. A widget styles it through
 * `class`; a skin does the rest. Unstyled-but-correct is the accepted
 * failure mode, never a broken widget.
 *
 * **Form controls are host-owned.** `input`, `textarea`, `sp-composer-field`,
 * `sp-combobox`, `sp-slider` and `sp-switch` raise their value on `input` /
 * `change`; a component never writes `value` back except to reset it, so a
 * keystroke is one message and the caret never moves.
 *
 * **Events** arrive as `CustomEvent`s whose `detail` each element's `doc`
 * states; a plain control's carry `{ value }` (`{ checked }` for a checkbox),
 * and a click carries nothing.
 *
 * Every element also takes `slot` (which named slot of its sp-element
 * parent it fills) — not listed per element, allowed everywhere.
 *
 * Nothing here is an `on*` attribute, a `style` attribute, `script`, `style`
 * or `iframe` — `sp-frame` is the one way to a real document, through the
 * frame machinery (opaque origin, CSP, a MessageChannel port). The SDK's own
 * tests hold that line.
 *
 * **Values are checked too** ({@link hostAttributeValueFinding}): a name in
 * the table is not a licence for any value — `href` is `https:` or a
 * fragment, `target` only `_blank` / `_self`, `input type` a short list. The
 * receiver calls it for every attribute it mirrors; ids are the receiver's
 * to prefix per widget box, so a remote cannot collide with the page's.
 *
 * @experimental 🚧 provisional until core's own session widgets render
 * through it (C7, R21): the set may grow and an attribute may be renamed
 * before then. It never shrinks after 1.0.
 */
/** One element in the vocabulary. @experimental */
export interface HostElementSpec {
    /** Attributes the host accepts; anything else is dropped. */
    readonly attributes: readonly string[];
    /** Events the host raises to the component. */
    readonly events: readonly string[];
    /** Named slots a child fills with `slot="<name>"`; unslotted children are the body. */
    readonly slots?: readonly string[];
    /** Sp elements only: the child elements it lays out (a menu's items, a tab's panels). */
    readonly children?: readonly string[];
    /** Sp elements only: the structural classes a skin targets, besides `.sp-<name>` on the root. */
    readonly parts?: readonly string[];
    /** What the element is for, and what its events carry — the `.d.ts` prints it. */
    readonly doc: string;
}
/**
 * The allowlist. Keys are tag names; order is the order the `.d.ts` prints.
 *
 * @experimental 🚧 until C7 (see the module note).
 */
export declare const SP_HOST_ELEMENTS: {
    readonly div: HostElementSpec;
    readonly span: HostElementSpec;
    readonly p: HostElementSpec;
    readonly ul: HostElementSpec;
    readonly ol: HostElementSpec;
    readonly li: HostElementSpec;
    readonly h1: HostElementSpec;
    readonly h2: HostElementSpec;
    readonly h3: HostElementSpec;
    readonly h4: HostElementSpec;
    readonly strong: HostElementSpec;
    readonly em: HostElementSpec;
    readonly small: HostElementSpec;
    readonly code: HostElementSpec;
    readonly kbd: HostElementSpec;
    readonly article: HostElementSpec;
    readonly header: HostElementSpec;
    readonly section: HostElementSpec;
    readonly dl: HostElementSpec;
    readonly dt: HostElementSpec;
    readonly dd: HostElementSpec;
    readonly hr: HostElementSpec;
    readonly br: HostElementSpec;
    readonly table: HostElementSpec;
    readonly thead: HostElementSpec;
    readonly tbody: HostElementSpec;
    readonly tr: HostElementSpec;
    readonly th: HostElementSpec;
    readonly td: HostElementSpec;
    readonly button: HostElementSpec;
    readonly input: HostElementSpec;
    readonly textarea: HostElementSpec;
    readonly label: HostElementSpec;
    readonly img: HostElementSpec;
    readonly a: HostElementSpec;
    readonly 'sp-avatar': {
        readonly attributes: readonly ["ref", "size", "class"];
        readonly events: readonly [];
        readonly parts: readonly ["sp-avatar-image", "sp-avatar-fallback"];
        readonly doc: "A participant's avatar, by participant reference (`character:3`, `user:1`). `size` is `sm` · `md` · `lg`.";
    };
    readonly 'sp-icon': {
        readonly attributes: readonly ["name", "size", "label", "class"];
        readonly events: readonly [];
        readonly doc: 'An icon from the app\'s set, by kebab-case name (`book-open`). With no `label` it is decorative.';
    };
    readonly 'sp-badge': {
        readonly attributes: readonly ["tone", "class"];
        readonly events: readonly [];
        readonly doc: 'A short label. `tone` is `neutral` · `primary` · `success` · `warning` · `error`.';
    };
    readonly 'sp-progress': {
        readonly attributes: readonly ["value", "max", "label", "class"];
        readonly events: readonly [];
        readonly parts: readonly ["sp-progress-track", "sp-progress-fill"];
        readonly doc: 'A progress bar. No `value` is indeterminate.';
    };
    readonly 'sp-tooltip': {
        readonly attributes: readonly ["text", "placement", "class"];
        readonly events: readonly [];
        readonly parts: readonly ["sp-tooltip-panel"];
        readonly doc: 'A tooltip over its body, which is the trigger. `placement` is a side (`top` · `bottom` · `left` · `right`).';
    };
    readonly 'sp-popover': {
        readonly attributes: readonly ["open", "placement", "label", "class"];
        readonly events: readonly ["open-change"];
        readonly slots: readonly ["trigger"];
        readonly parts: readonly ["sp-popover-panel"];
        readonly doc: 'A positioned panel. The `trigger` slot opens it; the body is the panel. `open-change` carries `{ open }`.';
    };
    readonly 'sp-menu': {
        readonly attributes: readonly ["open", "placement", "label", "class"];
        readonly events: readonly ["select", "open-change"];
        readonly slots: readonly ["trigger"];
        readonly children: readonly ["sp-menu-item"];
        readonly parts: readonly ["sp-menu-panel", "sp-menu-row"];
        readonly doc: 'A menu of actions. The `trigger` slot opens it. `select` carries `{ value }`; `open-change` carries `{ open }`.';
    };
    readonly 'sp-menu-item': {
        readonly attributes: readonly ["value", "disabled", "class"];
        readonly events: readonly [];
        readonly doc: 'One action in an `sp-menu`; its content (a label, an icon, a note) is the row\'s.';
    };
    readonly 'sp-dialog': {
        readonly attributes: readonly ["open", "label", "class"];
        readonly events: readonly ["open-change"];
        readonly slots: readonly ["title", "footer"];
        readonly parts: readonly ["sp-dialog-backdrop", "sp-dialog-panel"];
        readonly doc: 'A modal dialog, focus-trapped by the host. `open-change` carries `{ open }` — Escape and the backdrop close it.';
    };
    readonly 'sp-tabs': {
        readonly attributes: readonly ["value", "label", "class"];
        readonly events: readonly ["change"];
        readonly slots: readonly ["list-end"];
        readonly children: readonly ["sp-tab", "sp-tab-panel"];
        readonly parts: readonly ["sp-tabs-list", "sp-tab-trigger"];
        readonly doc: 'Tabs. `sp-tab` children are the list, `sp-tab-panel` children the panels, matched by `value`; the `list-end` slot sits at the end of the list (an overflow control). `change` carries `{ value }`.';
    };
    readonly 'sp-tab': {
        readonly attributes: readonly ["value", "disabled", "label", "class"];
        readonly events: readonly [];
        readonly doc: 'One tab in an `sp-tabs`; its content (a label, an icon) is the trigger\'s, `label` names the trigger when its content is only an icon, and its `class` is the trigger\'s too.';
    };
    readonly 'sp-tab-panel': {
        readonly attributes: readonly ["value", "class"];
        readonly events: readonly [];
        readonly doc: 'The panel an `sp-tab` of the same `value` shows.';
    };
    readonly 'sp-accordion': {
        readonly attributes: readonly ["value", "multiple", "class"];
        readonly events: readonly ["change"];
        readonly children: readonly ["sp-accordion-item"];
        readonly doc: 'Collapsible sections. `value` is the open item (space-separated when `multiple`). `change` carries `{ value }`.';
    };
    readonly 'sp-accordion-item': {
        readonly attributes: readonly ["value", "heading", "level", "class"];
        readonly events: readonly [];
        readonly parts: readonly ["sp-accordion-trigger", "sp-accordion-panel"];
        readonly doc: 'One section of an `sp-accordion`; `heading` is its trigger text (a heading of `level` 2–6, default 3), its body the panel.';
    };
    readonly 'sp-switch': {
        readonly attributes: readonly ["checked", "disabled", "label", "class"];
        readonly events: readonly ["change"];
        readonly doc: 'A host-owned on/off switch. `change` carries `{ checked }`.';
    };
    readonly 'sp-slider': {
        readonly attributes: readonly ["value", "min", "max", "step", "disabled", "label", "class"];
        readonly events: readonly ["input", "change"];
        readonly doc: 'A host-owned slider. `input` (while dragging) and `change` (on release) carry `{ value }`.';
    };
    readonly 'sp-combobox': {
        readonly attributes: readonly ["value", "placeholder", "disabled", "label", "class"];
        readonly events: readonly ["input", "change"];
        readonly children: readonly ["sp-option"];
        readonly doc: 'A host-owned searchable select. `input` carries `{ query }` as the person types; `change` carries `{ value }`.';
    };
    readonly 'sp-option': {
        readonly attributes: readonly ["value", "disabled", "class"];
        readonly events: readonly [];
        readonly doc: 'One option of an `sp-combobox`; its body is the label.';
    };
    readonly 'sp-message-body': {
        readonly attributes: readonly ["text", "streaming", "class"];
        readonly events: readonly ["open-image"];
        readonly doc: "A message's text, rendered as the app renders messages (markdown, quotes, actions) by the host. Update `text` as message pushes arrive; `streaming` shows the in-progress state. `open-image` (`{ src }`) fires when a person clicks an image in the text.";
    };
    readonly 'sp-composer-field': {
        readonly attributes: readonly ["value", "placeholder", "disabled", "label", "rows", "class", "submit-on", "keys", "field-class", "spellcheck", "aria-invalid", "aria-describedby", "aria-controls", "aria-activedescendant", "aria-autocomplete", "autofocus"];
        readonly events: readonly ["input", "change", "submit", "key", "focus"];
        readonly doc: string;
    };
    readonly 'sp-scroll': {
        readonly attributes: readonly ["stick", "label", "class"];
        readonly events: readonly ["reach-start"];
        readonly doc: 'A scroll region. `stick="bottom"` keeps it anchored to the end as content grows, as a log does (`stick="top"` for a newest-first log); scrolled away from that end, what is on screen stays put as rows arrive above or below. `reach-start` fires when the far end from `stick` is reached (load older).';
    };
    readonly 'sp-host-view': {
        readonly attributes: readonly ["name", "channel", "class"];
        readonly events: readonly [];
        readonly doc: "🚧 One of the host's own views, drawn by the host where the element sits (`name` from `HOST_VIEW_NAMES`). The widget places it and never sees inside it — what the host draws there is the viewer's, not the widget's. `channel` (1.1) says which channel the place is for — a channel-pinned conversation's turn controls and action chips are that channel's listing; absent, the host's own composer channel.";
    };
    readonly 'sp-frame': {
        readonly attributes: readonly ["src", "props", "title", "class"];
        readonly events: readonly ["action", "error", "invoke"];
        readonly doc: "A real document inside the widget, for what needs one (a rich-text editor, a charting library that measures). `src` is a document the plugin ships; `props` is JSON forwarded as the frame's props. The document's `invoke` is raised unresolved — `detail: { key, messageId?, payload?, blockId? }` — for the component to pass to `ctx.invoke(key, …)`, so the press meets this widget's actions and gate.";
    };
};
/** @experimental */
export type HostElementTag = keyof typeof SP_HOST_ELEMENTS;
/** The host sp elements alone — the elements the host must implement (C1b's boot gate). @experimental */
export declare const SP_ELEMENT_TAGS: Array<Extract<HostElementTag, `sp-${string}`>>;
/** Is this element in the vocabulary? @experimental */
export declare function isHostElement(tag: string): boolean;
/** Does this element accept this attribute? `slot` is accepted on every element. @experimental */
export declare function hostAttributeAllowed(tag: string, attribute: string): boolean;
/**
 * Attributes every element takes (C0b), besides `aria-*` (all of them; the
 * ones naming an element by id are the host's to prefix) and a widget's own
 * `data-*`: `hidden` and `inert` hide and disable what the widget drew;
 * `role`; `tabindex` (0 or -1 — into the tab order or out of it, never
 * ahead of the page's); and `style`, holding CUSTOM PROPERTIES only
 * (`--sp-fill: 40%`), which the widget's skin reads — a declaration of its
 * own could fetch (`url()`) or cover the page.
 * @experimental
 */
export declare const GLOBAL_ATTRIBUTES: readonly string[];
/** One `style` value's custom properties, or why it holds something else. @experimental */
export declare function customPropertiesFinding(value: string): string | undefined;
/**
 * A widget's own `data-*` attribute — what its skin and a style pack key
 * off. `data-sp-*` is the HOST's (`data-sp-owner` decides whose rules an
 * element falls under), so a widget never writes one.
 * @experimental
 */
export declare const isDataAttribute: (attribute: string) => boolean;
/** `input type`s a component may place — no `file`, `password`, `submit`, `image`, `hidden`. */
/**
 * 🚧 The host views a widget may place with `sp-host-view` (C0b) — parts of
 * the page that belong to the session, not to any widget: the status strips
 * above the composer and the composer's own page tabs. The list grows; a name
 * the host does not know renders nothing.
 * @experimental
 */
export declare const HOST_VIEW_NAMES: readonly ['session-banners', 'session-actions', 'retrieval-notice', 'run-progress', 'session-controls', 'session-workflow', 'retrieval-preview', 'session-usage', 'scene-images', 'session-statistics'];
/** @experimental */
export type HostViewName = (typeof HOST_VIEW_NAMES)[number];
/** 🚧 The `aria-current` values an element may carry — the ARIA tokens, no free text. @experimental */
export declare const HOST_ARIA_CURRENT: readonly ['page', 'step', 'location', 'date', 'time', 'true', 'false'];
/**
 * 🚧 The `aria-live` values an element may carry: `off` and `polite` only.
 * Never `assertive` — it interrupts whatever the screen reader is saying,
 * and a widget is one box among many on a page the person is using; a
 * widget that shouts over the composer or the page's own announcements
 * takes the reader away from the person. The page keeps assertive for its
 * own alerts.
 * @experimental
 */
export declare const HOST_ARIA_LIVE: readonly ['off', 'polite'];
/** @experimental */
export declare const HOST_INPUT_TYPES: readonly ['text', 'search', 'number', 'checkbox', 'radio', 'range', 'email', 'url', 'color', 'date', 'time'];
/**
 * 🚧 What a `key` event carries (R80) — `sp-composer-field`'s and a plain
 * `input`'s alike: the key pressed (`KeyboardEvent.key`), and the modifiers
 * held with it.
 * @experimental
 */
export interface HostKeyEventDetail {
    key: string;
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
}
/** 🚧 A key press as the host reads one — a `KeyboardEvent` is one. @experimental */
export interface HostKeyPress {
    readonly key: string;
    readonly shiftKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    /** Mid-composition (an IME's): never a key the widget handles. */
    readonly isComposing?: boolean;
}
/**
 * 🚧 Does this `keys` value name this press (R80)? THE reading of the
 * grammar, for every element that takes `keys`: a bare key names it whatever
 * is held — except that a bare `Enter` leaves Shift+Enter to the field (a
 * composer's newline) — and `Control+Enter` names it only while Control is
 * held (every modifier the token names held; others may be too). A press
 * mid-composition is named by nothing.
 * @experimental
 */
export declare function hostKeysMatch(keys: string | null | undefined, press: HostKeyPress): boolean;
/** 🚧 The `key` event's detail for this press (R80). @experimental */
export declare function hostKeyEventDetail(press: HostKeyPress): HostKeyEventDetail;
/**
 * Why this value may not be written to this attribute, or `undefined` if it
 * may. Assumes {@link hostAttributeAllowed} already said the name is fine.
 * Per tag where one attribute means two things (`sp-frame`'s `src` is a
 * document its plugin ships, a plain `img`'s is a URL).
 * @experimental
 */
export declare function hostAttributeValueFinding(tag: string, attribute: string, value: string): string | undefined;
/** Does this element raise this event? @experimental */
export declare function hostEventAllowed(tag: string, event: string): boolean;
/**
 * 🚧 The events the page re-delivers (C7): `click` alone. The receiver
 * forwards an event only from the node that listens for it, and only the
 * vocabulary's listeners exist — a button hears `click`; the `span` label
 * inside it does not, nor the `svg` an icon draws for itself — so a click on
 * a button's label or icon was lost. Never `change`, `input` and the rest: a
 * descendant's, re-delivered, would arrive as the ANCESTOR's own event
 * carrying the descendant's value.
 * @experimental
 */
export declare const REDELIVERED_EVENTS: readonly ['click'];
/**
 * 🚧 Where the page re-delivers an event that started on `origin`, or `null`
 * when it does not: the nearest element strictly inside `territory` (a
 * remote's box, or a panel one of its elements portaled out) that takes the
 * event, above where it starts. It starts at `origin` (a text node's parent)
 * — or, inside markup a host element drew for itself, at that element (the
 * outermost whose `ownsMarkup(origin)` says so). `null` when where it starts
 * takes the event (its own listener hears it), when nothing below
 * `territory` does, when `origin` is `territory` or outside it, and for an
 * event not in {@link REDELIVERED_EVENTS}.
 *
 * Reads the DOM and dispatches nothing: the page and the component harness
 * share it, and each dispatches {@link redeliveredCopy} there.
 * @experimental
 */
export declare function redeliveryTarget(origin: Node, type: string, territory: Element): Element | null;
/**
 * 🚧 The copy the page dispatches at {@link redeliveryTarget}: unbubbling, and
 * a `CustomEvent` — never a `MouseEvent`, whose dispatch runs an `<a>`'s or a
 * `<button>`'s activation, so the person's own click (which activates it on
 * its way up) would activate it twice: two downloads, two tabs. The listener
 * it reaches forwards nothing of it; the page's summary is read off the
 * person's event. Made in the event's own window, so a DOM beside another
 * realm's globals (a test's) dispatches it.
 * @experimental
 */
export declare function redeliveredCopy(e: Event): Event;
/**
 * 🚧 Where the page raises `key` for a keydown (R80): the plain `input` the
 * press landed on, when it sits strictly inside `territory` (a remote's box,
 * or a panel one of its elements portaled out) and its `keys` names the
 * press ({@link hostKeysMatch}) — else `null`. `sp-composer-field` reads its
 * own `keys`, by the same rule. Reads the DOM and dispatches nothing: the
 * page and the component harness share it, and each keeps the press from the
 * field (`preventDefault`) and dispatches {@link hostKeyEvent} there.
 * @experimental
 */
export declare function keyedInputTarget(e: KeyboardEvent, territory: Element): Element | null;
/**
 * 🚧 The `key` event the page dispatches at {@link keyedInputTarget} (R80):
 * a `CustomEvent` carrying {@link HostKeyEventDetail}, unbubbling — the
 * receiver listens on the field itself, and the page has no business with
 * it. Made in the press's own window, as {@link redeliveredCopy} is.
 * @experimental
 */
export declare function hostKeyEvent(e: KeyboardEvent): CustomEvent<HostKeyEventDetail>;
/**
 * The editor typings for the vocabulary, as the text of a `.d.ts` — shipped
 * from the SDK as `@serene-pub/sdk/host-elements` so an editor and the CLI
 * know every element, attribute, event and slot. Generated from the table,
 * so the typings cannot disagree with what the host accepts; a test holds
 * the checked-in file to this output.
 * @experimental
 */
export declare function hostElementsDts(): string;
/**
 * @experimental 🚧 with the vocabulary it versions (F1).
 *
 * The version of the host-element vocabulary's PUBLIC SHAPE — every tag in
 * {@link SP_HOST_ELEMENTS} with its attributes, events, slots, children and
 * parts, and the closed value lists beside it ({@link GLOBAL_ATTRIBUTES},
 * {@link HOST_VIEW_NAMES}, {@link HOST_ARIA_CURRENT}, {@link HOST_ARIA_LIVE},
 * {@link HOST_INPUT_TYPES}). A built component records the one it was built
 * against (`builtAgainst.hostElements`, F1), and a host refuses to mount one
 * whose MAJOR it lacks (`componentBuiltAgainstFinding`).
 *
 * `major.minor`, never a hash: a hash changes on every addition and cannot
 * tell "grew" (harmless — a year-old component places nothing new) from
 * "shrank" (fatal — it places what the host now drops). So:
 *
 * - **minor** bumps when the shape GROWS: a tag, an attribute, an event, a
 *   slot, a part, a value. A component built for a newer minor still mounts
 *   on an older host — what that host does not know it drops, the
 *   vocabulary's stated failure mode (unstyled-but-correct, R22).
 * - **major** bumps when anything is REMOVED, RENAMED or NARROWED (a value
 *   list loses a value, an event changes its `detail`). A host that has
 *   moved to a new major still lists the majors it keeps mounting.
 *
 * A test pins a hash of the shape to this version (`sdk-tests/
 * componentBuiltAgainst.test.ts`): change the table without bumping this and
 * the suite says which to bump. `doc` strings are not the shape.
 */
export declare const HOST_ELEMENTS_VERSION: '1.1';
//# sourceMappingURL=hostElements.d.ts.map