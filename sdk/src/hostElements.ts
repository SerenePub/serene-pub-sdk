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
	readonly attributes: readonly string[]
	/** Events the host raises to the component. */
	readonly events: readonly string[]
	/** Named slots a child fills with `slot="<name>"`; unslotted children are the body. */
	readonly slots?: readonly string[]
	/** Sp elements only: the child elements it lays out (a menu's items, a tab's panels). */
	readonly children?: readonly string[]
	/** Sp elements only: the structural classes a skin targets, besides `.sp-<name>` on the root. */
	readonly parts?: readonly string[]
	/** What the element is for, and what its events carry — the `.d.ts` prints it. */
	readonly doc: string
}

const plain = (doc: string, attributes: string[] = [], events: string[] = []): HostElementSpec => ({
	attributes: [...attributes, 'class'],
	events,
	doc,
})

/**
 * Attributes every plain element accepts for accessibility. `aria-current`
 * marks the current item of a list, stepper or trail and `aria-live` a live
 * region; both take a closed value set ({@link HOST_ARIA_CURRENT},
 * {@link HOST_ARIA_LIVE}), checked by {@link hostAttributeValueFinding}.
 */
const ARIA = [
	'id',
	'role',
	'aria-label',
	'aria-labelledby',
	'aria-describedby',
	'aria-hidden',
	'aria-current',
	'aria-live',
	'title',
]

/**
 * The allowlist. Keys are tag names; order is the order the `.d.ts` prints.
 *
 * @experimental 🚧 until C7 (see the module note).
 */
export const SP_HOST_ELEMENTS = {
	// ── plain elements ────────────────────────────────────────────────────
	div: plain('A block.', ARIA),
	span: plain('An inline run.', ARIA),
	p: plain('A paragraph.', ARIA),
	ul: plain('An unordered list.', ARIA),
	ol: plain('An ordered list.', ARIA),
	li: plain('A list item.', ARIA),
	h1: plain('A heading.', ARIA),
	h2: plain('A heading.', ARIA),
	h3: plain('A heading.', ARIA),
	h4: plain('A heading.', ARIA),
	strong: plain('Strong emphasis.', ARIA),
	em: plain('Emphasis.', ARIA),
	small: plain('Small print.', ARIA),
	code: plain('Inline code.', ARIA),
	kbd: plain('A key a person presses.', ARIA),
	article: plain('A self-contained item (a message, a card).', ARIA),
	header: plain("A group's heading row.", ARIA),
	section: plain('A titled part of a component (label it: `aria-label` or a heading).', ARIA),
	dl: plain('A description list.', ARIA),
	dt: plain('A described term.', ARIA),
	dd: plain("A term's description.", ARIA),
	hr: plain('A thematic break.', ARIA),
	br: plain('A line break.'),
	table: plain('A table.', ARIA),
	thead: plain('A table head.', ARIA),
	tbody: plain('A table body.', ARIA),
	tr: plain('A table row.', ARIA),
	th: plain('A header cell.', [...ARIA, 'scope', 'colspan', 'rowspan']),
	td: plain('A data cell.', [...ARIA, 'colspan', 'rowspan']),
	button: plain(
		'A button. `click` carries nothing.',
		[...ARIA, 'type', 'disabled', 'aria-pressed', 'aria-expanded'],
		['click'],
	),
	input: plain(
		'A host-owned text, number or checkbox input. `input` / `change` carry `{ value }` ' +
			'(`{ checked }` for a checkbox); `value` written by the component resets it. `keys` names keys ' +
			"the widget handles itself, in `sp-composer-field`'s words (`Escape Enter`, `Control+Enter`): each " +
			'is kept from the field and raised as `key` (`{ key, shift, ctrl, meta }`); every other key is the ' +
			"field's own, so a number field still steps on its arrows. `blur` (nothing carried) is the field " +
			'losing focus — a number field raises `change` on every spinner step, so an editor that closes when ' +
			'the person is done listens for `blur`.',
		[...ARIA, 'type', 'value', 'checked', 'placeholder', 'disabled', 'min', 'max', 'step', 'name', 'autocomplete', 'spellcheck', 'autofocus', 'keys'],
		['input', 'change', 'key', 'blur'],
	),
	textarea: plain(
		'A host-owned multi-line input. `input` / `change` carry `{ value }`.',
		[...ARIA, 'value', 'placeholder', 'disabled', 'rows', 'name', 'autocomplete', 'spellcheck', 'autofocus'],
		['input', 'change'],
	),
	label: plain('A label for a control.', ['for', 'id']),
	img: plain(
		'An image. `src` is an app media URL (`/media/…`, a session asset `/session-assets/<id>`) or the plugin\'s own file (`/plugin-ui/…`) — never another host. ' +
			'`loading` is `lazy` · `eager` and `decoding` `async` · `sync` · `auto` (1.2). `error` (nothing carried) is the image failing to load — a file deleted since, say — so a widget can draw its own stand-in rather than a broken image (1.2).',
		['src', 'alt', 'width', 'height', 'id', 'title', 'loading', 'decoding'],
		['error'],
	),
	a: plain(
		'A link. `href` is `https:`, a fragment or one of the app\'s own files (`/media/…`, `/session-assets/…`); `target` may only be `_blank`, `download` names a saved file, and the host sets `rel="noopener noreferrer"`.',
		[...ARIA, 'href', 'target', 'download'],
		['click'],
	),

	// ── host sp elements ────────────────────────────────────────────────────────
	'sp-avatar': {
		attributes: ['ref', 'size', 'class'],
		events: [],
		parts: ['sp-avatar-image', 'sp-avatar-fallback'],
		doc: "A participant's avatar, by participant reference (`character:3`, `user:1`). `size` is `sm` · `md` · `lg`.",
	},
	'sp-icon': {
		attributes: ['name', 'size', 'label', 'class'],
		events: [],
		doc: 'An icon from the app\'s set, by kebab-case name (`book-open`). With no `label` it is decorative.',
	},
	'sp-badge': {
		attributes: ['tone', 'class'],
		events: [],
		doc: 'A short label. `tone` is `neutral` · `primary` · `success` · `warning` · `error`.',
	},
	'sp-progress': {
		attributes: ['value', 'max', 'label', 'class'],
		events: [],
		parts: ['sp-progress-track', 'sp-progress-fill'],
		doc: 'A progress bar. No `value` is indeterminate.',
	},
	'sp-tooltip': {
		attributes: ['text', 'placement', 'class'],
		events: [],
		parts: ['sp-tooltip-panel'],
		doc: 'A tooltip over its body, which is the trigger. `placement` is a side (`top` · `bottom` · `left` · `right`).',
	},
	'sp-popover': {
		attributes: ['open', 'placement', 'label', 'class'],
		events: ['open-change'],
		slots: ['trigger'],
		parts: ['sp-popover-panel'],
		doc: 'A positioned panel. The `trigger` slot opens it; the body is the panel. `open-change` carries `{ open }`.',
	},
	'sp-menu': {
		attributes: ['open', 'placement', 'label', 'class'],
		events: ['select', 'open-change'],
		slots: ['trigger'],
		children: ['sp-menu-item'],
		parts: ['sp-menu-panel', 'sp-menu-row'],
		doc: 'A menu of actions. The `trigger` slot opens it. `select` carries `{ value }`; `open-change` carries `{ open }`.',
	},
	'sp-menu-item': {
		attributes: ['value', 'disabled', 'class'],
		events: [],
		doc: 'One action in an `sp-menu`; its content (a label, an icon, a note) is the row\'s.',
	},
	'sp-dialog': {
		attributes: ['open', 'label', 'class'],
		events: ['open-change'],
		slots: ['title', 'footer'],
		parts: ['sp-dialog-backdrop', 'sp-dialog-panel'],
		doc: 'A modal dialog, focus-trapped by the host. `open-change` carries `{ open }` — Escape and the backdrop close it.',
	},
	'sp-tabs': {
		attributes: ['value', 'label', 'class'],
		events: ['change'],
		slots: ['list-end'],
		children: ['sp-tab', 'sp-tab-panel'],
		parts: ['sp-tabs-list', 'sp-tab-trigger'],
		doc: 'Tabs. `sp-tab` children are the list, `sp-tab-panel` children the panels, matched by `value`; the `list-end` slot sits at the end of the list (an overflow control). `change` carries `{ value }`.',
	},
	'sp-tab': {
		attributes: ['value', 'disabled', 'label', 'class'],
		events: [],
		doc: 'One tab in an `sp-tabs`; its content (a label, an icon) is the trigger\'s, `label` names the trigger when its content is only an icon, and its `class` is the trigger\'s too.',
	},
	'sp-tab-panel': {
		attributes: ['value', 'class'],
		events: [],
		doc: 'The panel an `sp-tab` of the same `value` shows.',
	},
	'sp-accordion': {
		attributes: ['value', 'multiple', 'class'],
		events: ['change'],
		children: ['sp-accordion-item'],
		doc: 'Collapsible sections. `value` is the open item (space-separated when `multiple`). `change` carries `{ value }`.',
	},
	'sp-accordion-item': {
		attributes: ['value', 'heading', 'level', 'class'],
		events: [],
		parts: ['sp-accordion-trigger', 'sp-accordion-panel'],
		doc: 'One section of an `sp-accordion`; `heading` is its trigger text (a heading of `level` 2–6, default 3), its body the panel.',
	},
	'sp-switch': {
		attributes: ['checked', 'disabled', 'label', 'class'],
		events: ['change'],
		doc: 'A host-owned on/off switch. `change` carries `{ checked }`.',
	},
	'sp-slider': {
		attributes: ['value', 'min', 'max', 'step', 'disabled', 'label', 'class'],
		events: ['input', 'change'],
		doc: 'A host-owned slider. `input` (while dragging) and `change` (on release) carry `{ value }`.',
	},
	'sp-combobox': {
		attributes: ['value', 'placeholder', 'disabled', 'label', 'class'],
		events: ['input', 'change'],
		children: ['sp-option'],
		doc: 'A host-owned searchable select. `input` carries `{ query }` as the person types; `change` carries `{ value }`.',
	},
	'sp-option': {
		attributes: ['value', 'disabled', 'class'],
		events: [],
		doc: 'One option of an `sp-combobox`; its body is the label.',
	},
	'sp-message-body': {
		attributes: ['text', 'streaming', 'class'],
		events: ['open-image'],
		doc: "A message's text, rendered as the app renders messages (markdown, quotes, actions) by the host. Update `text` as message pushes arrive; `streaming` shows the in-progress state. `open-image` (`{ src }`) fires when a person clicks an image in the text.",
	},
	'sp-composer-field': {
		attributes: [
			'value',
			'placeholder',
			'disabled',
			'label',
			'rows',
			'class',
			'submit-on',
			'keys',
			'field-class',
			'spellcheck',
			'aria-invalid',
			'aria-describedby',
			'aria-controls',
			'aria-activedescendant',
			'aria-autocomplete',
			'autofocus',
		],
		events: ['input', 'change', 'submit', 'key', 'focus'],
		doc:
			"The app's composer text field, host-owned: the caret stays on the page. `input` / `change` carry `{ value }`; " +
			'`submit` carries `{ value }` on the send key (Enter without Shift) unless `submit-on="none"`. `keys` names ' +
			'keys the widget handles itself (`ArrowUp ArrowDown Tab Escape Enter`; a bare `Enter` leaves Shift+Enter to ' +
			'the field), or a key only while a modifier is held (`Control+Enter Meta+Enter`; `Control`, `Meta`, `Shift`): each is ' +
			'kept from the field and raised as `key` (`{ key, shift, ctrl, meta }`). `autofocus` (core\'s alone) gives the ' +
			'field the caret, at its end, as it lands. The `aria-*` given here go on the field itself; `field-class` ' +
			"replaces the field's own classes (a composer skin styles the field, not its wrapper).",
	},
	'sp-file-picker': {
		attributes: ['accept', 'multiple', 'disabled', 'class'],
		events: ['files'],
		doc:
			"🚧 Opens the device's file picker when its body is clicked (1.3). The body is the widget's own control — a `button` " +
			'it draws and names (`aria-label="Attach files"`) — so its look and label stay the widget\'s. `accept` is the ' +
			"picker's filter (`image/png,.md`), `multiple` lets several be chosen, `disabled` opens nothing. `files` carries " +
			'`{ files: File[] }`, the chosen files as the page holds them. A file `input` is not in the vocabulary ' +
			'(`input type`): this is the one way to a file.',
	},
	'sp-drop-zone': {
		attributes: ['disabled', 'label', 'class'],
		events: ['files'],
		parts: ['sp-drop-zone-overlay'],
		doc:
			'🚧 A region files can be dropped onto or pasted into (1.3). Its body is the region. While files are dragged over it the ' +
			'host shows an overlay (`sp-drop-zone-overlay`) saying `label` (default "Drop to attach"). `files` carries ' +
			'`{ files: File[], via: "drop" | "paste" }` — a drop, or a paste of files (a screenshot) anywhere inside the region; ' +
			'a paste of text stays the field\'s.',
	},
	'sp-scroll': {
		attributes: ['stick', 'label', 'class'],
		events: ['reach-start'],
		doc: 'A scroll region. `stick="bottom"` keeps it anchored to the end as content grows, as a log does (`stick="top"` for a newest-first log); scrolled away from that end, what is on screen stays put as rows arrive above or below. `reach-start` fires when the far end from `stick` is reached (load older).',
	},
	'sp-host-view': {
		attributes: ['name', 'channel', 'class'],
		events: [],
		doc: "🚧 One of the host's own views, drawn by the host where the element sits (`name` from `HOST_VIEW_NAMES`). The widget places it and never sees inside it — what the host draws there is the viewer's, not the widget's. `channel` (1.1) says which channel the place is for — a channel-pinned conversation's turn controls and action chips are that channel's listing; absent, the host's own composer channel.",
	},
	'sp-frame': {
		attributes: ['src', 'props', 'title', 'class'],
		events: ['action', 'error', 'invoke'],
		doc: "A real document inside the widget, for what needs one (a rich-text editor, a charting library that measures). `src` is a document the plugin ships; `props` is JSON forwarded as the frame's props. The document's `invoke` is raised unresolved — `detail: { key, messageId?, payload?, blockId? }` — for the component to pass to `ctx.invoke(key, …)`, so the press meets this widget's actions and gate.",
	},
} as const satisfies Record<string, HostElementSpec>

/** @experimental */
export type HostElementTag = keyof typeof SP_HOST_ELEMENTS

/** The host sp elements alone — the elements the host must implement (C1b's boot gate). @experimental */
export const SP_ELEMENT_TAGS = Object.keys(SP_HOST_ELEMENTS).filter((t) =>
	t.startsWith('sp-'),
) as Array<Extract<HostElementTag, `sp-${string}`>>

const isTag = (tag: string): tag is HostElementTag => Object.hasOwn(SP_HOST_ELEMENTS, tag)

/** Is this element in the vocabulary? @experimental */
export function isHostElement(tag: string): boolean {
	return isTag(tag.toLowerCase())
}

/** Does this element accept this attribute? `slot` is accepted on every element. @experimental */
export function hostAttributeAllowed(tag: string, attribute: string): boolean {
	const t = tag.toLowerCase()
	if (!isTag(t)) return false
	return (
		attribute === 'slot' ||
		GLOBAL_ATTRIBUTES.includes(attribute) ||
		isDataAttribute(attribute) ||
		/^aria-[a-z]+$/.test(attribute) ||
		(SP_HOST_ELEMENTS[t].attributes as readonly string[]).includes(attribute)
	)
}

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
export const GLOBAL_ATTRIBUTES: readonly string[] = ['hidden', 'inert', 'role', 'tabindex', 'style']

/** One `style` value's custom properties, or why it holds something else. @experimental */
export function customPropertiesFinding(value: string): string | undefined {
	for (const decl of value.split(';')) {
		const d = decl.trim()
		if (!d) continue
		const m = /^(--[A-Za-z0-9_-]+)\s*:\s*(.*)$/s.exec(d)
		if (!m) return `style '${value}' — custom properties only (--name: value); a widget's skin reads them`
		if (/url\s*\(|src\s*\(|image\s*\(|image-set|expression\s*\(|\\|@import|[<>]/i.test(m[2]))
			return `style '${value}' — a custom property's value is plain data (no url(), no escapes)`
	}
	return undefined
}

/**
 * A widget's own `data-*` attribute — what its skin and a style pack key
 * off. `data-sp-*` is the HOST's (`data-sp-owner` decides whose rules an
 * element falls under), so a widget never writes one.
 * @experimental
 */
export const isDataAttribute = (attribute: string): boolean =>
	/^data-[a-z0-9][a-z0-9-]*$/.test(attribute) && !attribute.startsWith('data-sp-')

/** `input type`s a component may place — no `file`, `password`, `submit`, `image`, `hidden`. */
/**
 * 🚧 The host views a widget may place with `sp-host-view` (C0b) — parts of
 * the page that belong to the session, not to any widget: the status strips
 * above the composer and the composer's own page tabs. The list grows; a name
 * the host does not know renders nothing.
 * @experimental
 */
export const HOST_VIEW_NAMES = [
	'session-banners',
	'session-actions',
	'retrieval-notice',
	'run-progress',
	'session-controls',
	'session-workflow',
	'retrieval-preview',
	'session-usage',
	'scene-images',
	'session-statistics',
] as const
/** @experimental */
export type HostViewName = (typeof HOST_VIEW_NAMES)[number]

/** 🚧 The `aria-current` values an element may carry — the ARIA tokens, no free text. @experimental */
export const HOST_ARIA_CURRENT = ['page', 'step', 'location', 'date', 'time', 'true', 'false'] as const

/**
 * 🚧 The `aria-live` values an element may carry: `off` and `polite` only.
 * Never `assertive` — it interrupts whatever the screen reader is saying,
 * and a widget is one box among many on a page the person is using; a
 * widget that shouts over the composer or the page's own announcements
 * takes the reader away from the person. The page keeps assertive for its
 * own alerts.
 * @experimental
 */
export const HOST_ARIA_LIVE = ['off', 'polite'] as const

/** @experimental */
export const HOST_INPUT_TYPES = ['text', 'search', 'number', 'checkbox', 'radio', 'range', 'email', 'url', 'color', 'date', 'time'] as const

const HTTPS = /^https:\/\/[^\s]+$/i
/**
 * An app media URL: the app's own `/media/…`, `/plugin-ui/…` or
 * `/session-assets/…` routes, same origin. A query is allowed — every face
 * the page resolves names its revision (`/media/<uuid>?v=thumb&r=3`) — a dot
 * segment never: `/media/../api/x` is `/api/x` once the browser resolves it,
 * and an image is a GET the page makes with its own cookies.
 *
 * A session asset — a message part's image or file, a block's image — is
 * the route's own shape and nothing more: `/session-assets/<file id>`, a
 * positive integer, with an optional query (`?v=thumb`). The route only
 * redirects to `/media/<id>`, whose access check is the wall; a path under
 * the id is no asset the app serves. Which session a file belongs to is not
 * in its address, so that is the server's to judge, never the URL's.
 */
const APP_MEDIA = /^\/(media|plugin-ui)\/[A-Za-z0-9._~%\/-]+(\?[A-Za-z0-9._~%=&-]*)?$/
const SESSION_ASSET = /^\/session-assets\/[1-9][0-9]*(\?[A-Za-z0-9._~%=&-]*)?$/
const DOT_SEGMENT = /(^|\/)(\.|%2e){1,2}(\/|$)/i
const isAppMedia = (v: string) =>
	SESSION_ASSET.test(v) || (APP_MEDIA.test(v) && !DOT_SEGMENT.test(v.split('?')[0]!))

/**
 * One `keys` token — `sp-composer-field`'s and a plain `input`'s (R80): a
 * key, after any number of the modifiers the host reads (`Control+Enter`,
 * `Shift+Meta+ArrowUp`). The key holds no `+`: {@link hostKeysMatch} splits
 * a token at its `+`s, so `+` or `Control++` would read as an empty key. A
 * modifier the host does not read (`Alt+`, `Ctrl+`, a lowercase `control+`)
 * or a token that ends at its `+` would be a key no press ever matches —
 * kept from nothing, and silently — so it is refused instead.
 */
const HOST_KEYS_TOKEN = /^(?:(?:Control|Meta|Shift)\+)*[^+]+$/

/** The elements that take `keys`, and raise `key` for a press it names. */
const KEYED_TAGS: ReadonlySet<string> = new Set(['sp-composer-field', 'input'])

/**
 * 🚧 What a `key` event carries (R80) — `sp-composer-field`'s and a plain
 * `input`'s alike: the key pressed (`KeyboardEvent.key`), and the modifiers
 * held with it.
 * @experimental
 */
export interface HostKeyEventDetail {
	key: string
	shift: boolean
	ctrl: boolean
	meta: boolean
}

/** 🚧 A key press as the host reads one — a `KeyboardEvent` is one. @experimental */
export interface HostKeyPress {
	readonly key: string
	readonly shiftKey: boolean
	readonly ctrlKey: boolean
	readonly metaKey: boolean
	/** Mid-composition (an IME's): never a key the widget handles. */
	readonly isComposing?: boolean
}

/** The modifiers a `keys` token may name before its key, and how a press holds each. */
const HELD_MODIFIERS: ReadonlyMap<string, (press: HostKeyPress) => boolean> = new Map([
	['Control', (p: HostKeyPress) => p.ctrlKey],
	['Meta', (p: HostKeyPress) => p.metaKey],
	['Shift', (p: HostKeyPress) => p.shiftKey],
])

/**
 * 🚧 Does this `keys` value name this press (R80)? THE reading of the
 * grammar, for every element that takes `keys`: a bare key names it whatever
 * is held — except that a bare `Enter` leaves Shift+Enter to the field (a
 * composer's newline) — and `Control+Enter` names it only while Control is
 * held (every modifier the token names held; others may be too). A press
 * mid-composition is named by nothing.
 * @experimental
 */
export function hostKeysMatch(keys: string | null | undefined, press: HostKeyPress): boolean {
	if (!keys || press.isComposing) return false
	for (const token of keys.split(/\s+/)) {
		if (!token) continue
		const held = token.split('+')
		const key = held.pop() ?? ''
		if (key !== press.key) continue
		if (held.length ? held.every((m) => HELD_MODIFIERS.get(m)?.(press) ?? false) : !(key === 'Enter' && press.shiftKey))
			return true
	}
	return false
}

/** 🚧 The `key` event's detail for this press (R80). @experimental */
export function hostKeyEventDetail(press: HostKeyPress): HostKeyEventDetail {
	return { key: press.key, shift: press.shiftKey, ctrl: press.ctrlKey, meta: press.metaKey }
}

/**
 * Why this value may not be written to this attribute, or `undefined` if it
 * may. Assumes {@link hostAttributeAllowed} already said the name is fine.
 * Per tag where one attribute means two things (`sp-frame`'s `src` is a
 * document its plugin ships, a plain `img`'s is a URL).
 * @experimental
 */
export function hostAttributeValueFinding(tag: string, attribute: string, value: string): string | undefined {
	const t = tag.toLowerCase()
	const v = value.trim()
	if (attribute === 'style') return customPropertiesFinding(v)
	if (attribute === 'tabindex') return v === '0' || v === '-1' ? undefined : `tabindex '${value}' — 0 or -1`
	if (attribute === 'aria-current')
		return (HOST_ARIA_CURRENT as readonly string[]).includes(v)
			? undefined
			: `aria-current '${value}' — one of ${HOST_ARIA_CURRENT.join(', ')}`
	if (attribute === 'aria-live')
		return (HOST_ARIA_LIVE as readonly string[]).includes(v)
			? undefined
			: `aria-live '${value}' — off or polite (never assertive: a widget does not interrupt the reader)`
	if (attribute === 'href') {
		// A person clicks a link, so it may name the app's own files (a
		// download, an attachment) as well as another site.
		if (v.startsWith('#') || HTTPS.test(v) || isAppMedia(v)) return undefined
		return `${t} href '${value}' — https: links, #fragments and the app's own files only`
	}
	if (t === 'sp-host-view' && attribute === 'name')
		return (HOST_VIEW_NAMES as readonly string[]).includes(v) ? undefined : `sp-host-view name '${value}' — one of ${HOST_VIEW_NAMES.join(', ')}`
	if (t === 'sp-composer-field' && attribute === 'submit-on')
		return v === 'enter' || v === 'none' ? undefined : `sp-composer-field submit-on '${value}' — enter or none`
	if (KEYED_TAGS.has(t) && attribute === 'keys') {
		const bad = v.split(/\s+/).find((token) => token && !HOST_KEYS_TOKEN.test(token))
		return bad === undefined
			? undefined
			: `${t} keys '${bad}' — a key, after any of the modifiers Control+, Meta+ and Shift+ (Control+Enter)`
	}
	if (t === 'img' && attribute === 'loading')
		return v === 'lazy' || v === 'eager' ? undefined : `img loading '${value}' — lazy or eager`
	if (t === 'img' && attribute === 'decoding')
		return v === 'async' || v === 'sync' || v === 'auto' ? undefined : `img decoding '${value}' — async, sync or auto`
	if (t === 'sp-scroll' && attribute === 'stick')
		return v === 'top' || v === 'bottom' ? undefined : `sp-scroll stick '${value}' — top or bottom`
	if (attribute === 'src') {
		if (t === 'sp-frame')
			return /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9._-]+)*$/.test(v) && !v.split('/').some((s) => s === '.' || s === '..')
				? undefined
				: `sp-frame src '${value}' — a document path inside the plugin`
		// Never another host: an image URL is a request the PAGE makes, so an
		// https image would be a way out for what a remote was shown.
		return isAppMedia(v) ? undefined : `${t} src '${value}' — the app's media or the plugin's own files only`
	}
	// `_self` would navigate the app away; the host sets `rel` itself.
	if (attribute === 'target') return v === '_blank' ? undefined : `target '${value}' — only _blank`
	if (t === 'input' && attribute === 'type')
		return (HOST_INPUT_TYPES as readonly string[]).includes(v.toLowerCase())
			? undefined
			: `input type '${value}' — one of ${HOST_INPUT_TYPES.join(', ')}`
	if (attribute === 'props' && t === 'sp-frame') {
		try {
			const p = JSON.parse(v)
			return p && typeof p === 'object' && !Array.isArray(p) ? undefined : 'sp-frame props — a JSON object'
		} catch {
			return 'sp-frame props — a JSON object'
		}
	}
	return undefined
}

/** Does this element raise this event? @experimental */
export function hostEventAllowed(tag: string, event: string): boolean {
	const t = tag.toLowerCase()
	return isTag(t) && (SP_HOST_ELEMENTS[t].events as readonly string[]).includes(event)
}

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
export const REDELIVERED_EVENTS = ['click'] as const

const takes = (el: Element, type: string) =>
	isTag(el.localName) && (SP_HOST_ELEMENTS[el.localName].events as readonly string[]).includes(type)

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
export function redeliveryTarget(origin: Node, type: string, territory: Element): Element | null {
	if (!(REDELIVERED_EVENTS as readonly string[]).includes(type)) return null
	if (origin === territory || !territory.contains(origin)) return null
	const originEl = origin.nodeType === 1 ? (origin as Element) : origin.parentElement
	// A text node straight inside the territory: nothing below it encloses it.
	if (!originEl || originEl === territory) return null
	let start: Element = originEl
	for (let n: Node | null = origin; n && n !== territory; n = n.parentNode) {
		const el = n as Element & { ownsMarkup?: (t: Node | null) => boolean }
		if (typeof el.ownsMarkup === 'function' && el.ownsMarkup(origin)) start = el
	}
	if (takes(start, type)) return null
	for (let n = start.parentElement; n && n !== territory; n = n.parentElement) if (takes(n, type)) return n
	return null
}

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
export function redeliveredCopy(e: Event): Event {
	const view = (e.target as Node | null)?.ownerDocument?.defaultView
	const Custom = view?.CustomEvent ?? CustomEvent
	return new Custom(e.type, { bubbles: false, cancelable: e.cancelable })
}

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
export function keyedInputTarget(e: KeyboardEvent, territory: Element): Element | null {
	const t = e.target as Element | null
	if (!t || t.nodeType !== 1 || t.localName !== 'input') return null
	if (t === territory || !territory.contains(t)) return null
	return hostKeysMatch(t.getAttribute('keys'), e) ? t : null
}

/**
 * 🚧 The `key` event the page dispatches at {@link keyedInputTarget} (R80):
 * a `CustomEvent` carrying {@link HostKeyEventDetail}, unbubbling — the
 * receiver listens on the field itself, and the page has no business with
 * it. Made in the press's own window, as {@link redeliveredCopy} is.
 * @experimental
 */
export function hostKeyEvent(e: KeyboardEvent): CustomEvent<HostKeyEventDetail> {
	const view = (e.target as Node | null)?.ownerDocument?.defaultView
	const Custom = view?.CustomEvent ?? CustomEvent
	return new Custom<HostKeyEventDetail>('key', { detail: hostKeyEventDetail(e), bubbles: false })
}

/**
 * The editor typings for the vocabulary, as the text of a `.d.ts` — shipped
 * from the SDK as `@serene-pub/sdk/host-elements` so an editor and the CLI
 * know every element, attribute, event and slot. Generated from the table,
 * so the typings cannot disagree with what the host accepts; a test holds
 * the checked-in file to this output.
 * @experimental
 */
export function hostElementsDts(): string {
	const lines: string[] = [
		'// Generated from SP_HOST_ELEMENTS (sdk/src/hostElements.ts) — do not edit.',
		'// Regenerate: npm run host-elements -w sdk',
		'',
		'/** Attributes are strings on the wire; booleans are present-or-absent. @experimental 🚧 until C7 settles. */',
		'type SpAttr = string | number | boolean | null | undefined',
		'',
		'/** Every element a component may place, with the attributes each accepts. @experimental 🚧 until C7 settles. */',
		'export interface SpHostElements {',
	]
	for (const [tag, spec] of Object.entries(SP_HOST_ELEMENTS) as Array<[string, HostElementSpec]>) {
		const extra = [
			spec.slots?.length ? `Slots: ${spec.slots.map((s) => `\`${s}\``).join(', ')}.` : '',
			spec.children?.length ? `Children: ${spec.children.map((c) => `\`<${c}>\``).join(', ')}.` : '',
			tag.startsWith('sp-')
				? `Parts: ${[tag, ...(spec.parts ?? [])].map((p) => `\`.${p}\``).join(', ')}.`
				: '',
			spec.events.length ? `Events: ${spec.events.map((e) => `\`${e}\``).join(', ')}.` : '',
		].filter(Boolean)
		lines.push(`\t/**`, `\t * ${spec.doc}`)
		for (const e of extra) lines.push(`\t * ${e}`)
		lines.push(`\t */`)
		lines.push(`\t'${tag}': {`)
		for (const a of spec.attributes) lines.push(`\t\t'${a}'?: SpAttr`)
		// Any element may fill an sp element's named slot.
		lines.push(`\t\tslot?: string`)
		lines.push(`\t}`)
	}
	lines.push('}', '')
	lines.push('/** Every tag a component may place. @experimental 🚧 until C7 settles. */')
	lines.push('export type SpHostTag = keyof SpHostElements')
	lines.push('')
	lines.push('/** The events each tag raises, for `addEventListener` typing. @experimental 🚧 until C7 settles. */')
	lines.push('export interface SpHostEvents {')
	for (const [tag, spec] of Object.entries(SP_HOST_ELEMENTS) as Array<[string, HostElementSpec]>)
		if (spec.events.length)
			lines.push(`\t'${tag}': ${spec.events.map((e) => `'${e}'`).join(' | ')}`)
	lines.push('}', '')
	return lines.join('\n')
}

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
export const HOST_ELEMENTS_VERSION = '1.3' as const
