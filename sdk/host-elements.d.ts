// Generated from SP_HOST_ELEMENTS (sdk/src/hostElements.ts) — do not edit.
// Regenerate: npm run host-elements -w sdk

/** Attributes are strings on the wire; booleans are present-or-absent. @experimental 🚧 until C7 settles. */
type SpAttr = string | number | boolean | null | undefined

/** Every element a component may place, with the attributes each accepts. @experimental 🚧 until C7 settles. */
export interface SpHostElements {
	/**
	 * A block.
	 */
	'div': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * An inline run.
	 */
	'span': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A paragraph.
	 */
	'p': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * An unordered list.
	 */
	'ul': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * An ordered list.
	 */
	'ol': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A list item.
	 */
	'li': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A heading.
	 */
	'h1': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A heading.
	 */
	'h2': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A heading.
	 */
	'h3': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A heading.
	 */
	'h4': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * Strong emphasis.
	 */
	'strong': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * Emphasis.
	 */
	'em': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * Small print.
	 */
	'small': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * Inline code.
	 */
	'code': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A key a person presses.
	 */
	'kbd': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A self-contained item (a message, a card).
	 */
	'article': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A group's heading row.
	 */
	'header': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A titled part of a component (label it: `aria-label` or a heading).
	 */
	'section': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A description list.
	 */
	'dl': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A described term.
	 */
	'dt': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A term's description.
	 */
	'dd': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A thematic break.
	 */
	'hr': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A line break.
	 */
	'br': {
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A table.
	 */
	'table': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A table head.
	 */
	'thead': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A table body.
	 */
	'tbody': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A table row.
	 */
	'tr': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A header cell.
	 */
	'th': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'scope'?: SpAttr
		'colspan'?: SpAttr
		'rowspan'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A data cell.
	 */
	'td': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'colspan'?: SpAttr
		'rowspan'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A button. `click` carries nothing.
	 * Events: `click`.
	 */
	'button': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'type'?: SpAttr
		'disabled'?: SpAttr
		'aria-pressed'?: SpAttr
		'aria-expanded'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A host-owned text, number or checkbox input. `input` / `change` carry `{ value }` (`{ checked }` for a checkbox); `value` written by the component resets it. `keys` names keys the widget handles itself, in `sp-composer-field`'s words (`Escape Enter`, `Control+Enter`): each is kept from the field and raised as `key` (`{ key, shift, ctrl, meta }`); every other key is the field's own, so a number field still steps on its arrows. `blur` (nothing carried) is the field losing focus — a number field raises `change` on every spinner step, so an editor that closes when the person is done listens for `blur`.
	 * Events: `input`, `change`, `key`, `blur`.
	 */
	'input': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'type'?: SpAttr
		'value'?: SpAttr
		'checked'?: SpAttr
		'placeholder'?: SpAttr
		'disabled'?: SpAttr
		'min'?: SpAttr
		'max'?: SpAttr
		'step'?: SpAttr
		'name'?: SpAttr
		'autocomplete'?: SpAttr
		'spellcheck'?: SpAttr
		'autofocus'?: SpAttr
		'keys'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A host-owned multi-line input. `input` / `change` carry `{ value }`.
	 * Events: `input`, `change`.
	 */
	'textarea': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'value'?: SpAttr
		'placeholder'?: SpAttr
		'disabled'?: SpAttr
		'rows'?: SpAttr
		'name'?: SpAttr
		'autocomplete'?: SpAttr
		'spellcheck'?: SpAttr
		'autofocus'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A label for a control.
	 */
	'label': {
		'for'?: SpAttr
		'id'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * An image. `src` is an app media URL (`/media/…`, a session asset `/session-assets/<id>`) or the plugin's own file (`/plugin-ui/…`) — never another host.
	 */
	'img': {
		'src'?: SpAttr
		'alt'?: SpAttr
		'width'?: SpAttr
		'height'?: SpAttr
		'id'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A link. `href` is `https:`, a fragment or one of the app's own files (`/media/…`, `/session-assets/…`); `target` may only be `_blank`, `download` names a saved file, and the host sets `rel="noopener noreferrer"`.
	 * Events: `click`.
	 */
	'a': {
		'id'?: SpAttr
		'role'?: SpAttr
		'aria-label'?: SpAttr
		'aria-labelledby'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-hidden'?: SpAttr
		'aria-current'?: SpAttr
		'aria-live'?: SpAttr
		'title'?: SpAttr
		'href'?: SpAttr
		'target'?: SpAttr
		'download'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A participant's avatar, by participant reference (`character:3`, `user:1`). `size` is `sm` · `md` · `lg`.
	 * Parts: `.sp-avatar`, `.sp-avatar-image`, `.sp-avatar-fallback`.
	 */
	'sp-avatar': {
		'ref'?: SpAttr
		'size'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * An icon from the app's set, by kebab-case name (`book-open`). With no `label` it is decorative.
	 * Parts: `.sp-icon`.
	 */
	'sp-icon': {
		'name'?: SpAttr
		'size'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A short label. `tone` is `neutral` · `primary` · `success` · `warning` · `error`.
	 * Parts: `.sp-badge`.
	 */
	'sp-badge': {
		'tone'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A progress bar. No `value` is indeterminate.
	 * Parts: `.sp-progress`, `.sp-progress-track`, `.sp-progress-fill`.
	 */
	'sp-progress': {
		'value'?: SpAttr
		'max'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A tooltip over its body, which is the trigger. `placement` is a side (`top` · `bottom` · `left` · `right`).
	 * Parts: `.sp-tooltip`, `.sp-tooltip-panel`.
	 */
	'sp-tooltip': {
		'text'?: SpAttr
		'placement'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A positioned panel. The `trigger` slot opens it; the body is the panel. `open-change` carries `{ open }`.
	 * Slots: `trigger`.
	 * Parts: `.sp-popover`, `.sp-popover-panel`.
	 * Events: `open-change`.
	 */
	'sp-popover': {
		'open'?: SpAttr
		'placement'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A menu of actions. The `trigger` slot opens it. `select` carries `{ value }`; `open-change` carries `{ open }`.
	 * Slots: `trigger`.
	 * Children: `<sp-menu-item>`.
	 * Parts: `.sp-menu`, `.sp-menu-panel`, `.sp-menu-row`.
	 * Events: `select`, `open-change`.
	 */
	'sp-menu': {
		'open'?: SpAttr
		'placement'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * One action in an `sp-menu`; its content (a label, an icon, a note) is the row's.
	 * Parts: `.sp-menu-item`.
	 */
	'sp-menu-item': {
		'value'?: SpAttr
		'disabled'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A modal dialog, focus-trapped by the host. `open-change` carries `{ open }` — Escape and the backdrop close it.
	 * Slots: `title`, `footer`.
	 * Parts: `.sp-dialog`, `.sp-dialog-backdrop`, `.sp-dialog-panel`.
	 * Events: `open-change`.
	 */
	'sp-dialog': {
		'open'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * Tabs. `sp-tab` children are the list, `sp-tab-panel` children the panels, matched by `value`; the `list-end` slot sits at the end of the list (an overflow control). `change` carries `{ value }`.
	 * Slots: `list-end`.
	 * Children: `<sp-tab>`, `<sp-tab-panel>`.
	 * Parts: `.sp-tabs`, `.sp-tabs-list`, `.sp-tab-trigger`.
	 * Events: `change`.
	 */
	'sp-tabs': {
		'value'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * One tab in an `sp-tabs`; its content (a label, an icon) is the trigger's, `label` names the trigger when its content is only an icon, and its `class` is the trigger's too.
	 * Parts: `.sp-tab`.
	 */
	'sp-tab': {
		'value'?: SpAttr
		'disabled'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * The panel an `sp-tab` of the same `value` shows.
	 * Parts: `.sp-tab-panel`.
	 */
	'sp-tab-panel': {
		'value'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * Collapsible sections. `value` is the open item (space-separated when `multiple`). `change` carries `{ value }`.
	 * Children: `<sp-accordion-item>`.
	 * Parts: `.sp-accordion`.
	 * Events: `change`.
	 */
	'sp-accordion': {
		'value'?: SpAttr
		'multiple'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * One section of an `sp-accordion`; `heading` is its trigger text (a heading of `level` 2–6, default 3), its body the panel.
	 * Parts: `.sp-accordion-item`, `.sp-accordion-trigger`, `.sp-accordion-panel`.
	 */
	'sp-accordion-item': {
		'value'?: SpAttr
		'heading'?: SpAttr
		'level'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A host-owned on/off switch. `change` carries `{ checked }`.
	 * Parts: `.sp-switch`.
	 * Events: `change`.
	 */
	'sp-switch': {
		'checked'?: SpAttr
		'disabled'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A host-owned slider. `input` (while dragging) and `change` (on release) carry `{ value }`.
	 * Parts: `.sp-slider`.
	 * Events: `input`, `change`.
	 */
	'sp-slider': {
		'value'?: SpAttr
		'min'?: SpAttr
		'max'?: SpAttr
		'step'?: SpAttr
		'disabled'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A host-owned searchable select. `input` carries `{ query }` as the person types; `change` carries `{ value }`.
	 * Children: `<sp-option>`.
	 * Parts: `.sp-combobox`.
	 * Events: `input`, `change`.
	 */
	'sp-combobox': {
		'value'?: SpAttr
		'placeholder'?: SpAttr
		'disabled'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * One option of an `sp-combobox`; its body is the label.
	 * Parts: `.sp-option`.
	 */
	'sp-option': {
		'value'?: SpAttr
		'disabled'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A message's text, rendered as the app renders messages (markdown, quotes, actions) by the host. Update `text` as message pushes arrive; `streaming` shows the in-progress state. `open-image` (`{ src }`) fires when a person clicks an image in the text.
	 * Parts: `.sp-message-body`.
	 * Events: `open-image`.
	 */
	'sp-message-body': {
		'text'?: SpAttr
		'streaming'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * The app's composer text field, host-owned: the caret stays on the page. `input` / `change` carry `{ value }`; `submit` carries `{ value }` on the send key (Enter without Shift) unless `submit-on="none"`. `keys` names keys the widget handles itself (`ArrowUp ArrowDown Tab Escape Enter`; a bare `Enter` leaves Shift+Enter to the field), or a key only while a modifier is held (`Control+Enter Meta+Enter`; `Control`, `Meta`, `Shift`): each is kept from the field and raised as `key` (`{ key, shift, ctrl, meta }`). `autofocus` (core's alone) gives the field the caret, at its end, as it lands. The `aria-*` given here go on the field itself; `field-class` replaces the field's own classes (a composer skin styles the field, not its wrapper).
	 * Parts: `.sp-composer-field`.
	 * Events: `input`, `change`, `submit`, `key`, `focus`.
	 */
	'sp-composer-field': {
		'value'?: SpAttr
		'placeholder'?: SpAttr
		'disabled'?: SpAttr
		'label'?: SpAttr
		'rows'?: SpAttr
		'class'?: SpAttr
		'submit-on'?: SpAttr
		'keys'?: SpAttr
		'field-class'?: SpAttr
		'spellcheck'?: SpAttr
		'aria-invalid'?: SpAttr
		'aria-describedby'?: SpAttr
		'aria-controls'?: SpAttr
		'aria-activedescendant'?: SpAttr
		'aria-autocomplete'?: SpAttr
		'autofocus'?: SpAttr
		slot?: string
	}
	/**
	 * A scroll region. `stick="bottom"` keeps it anchored to the end as content grows, as a log does (`stick="top"` for a newest-first log); scrolled away from that end, what is on screen stays put as rows arrive above or below. `reach-start` fires when the far end from `stick` is reached (load older).
	 * Parts: `.sp-scroll`.
	 * Events: `reach-start`.
	 */
	'sp-scroll': {
		'stick'?: SpAttr
		'label'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * 🚧 One of the host's own views, drawn by the host where the element sits (`name` from `HOST_VIEW_NAMES`). The widget places it and never sees inside it — what the host draws there is the viewer's, not the widget's. `channel` (1.1) says which channel the place is for — a channel-pinned conversation's turn controls and action chips are that channel's listing; absent, the host's own composer channel.
	 * Parts: `.sp-host-view`.
	 */
	'sp-host-view': {
		'name'?: SpAttr
		'channel'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
	/**
	 * A real document inside the widget, for what needs one (a rich-text editor, a charting library that measures). `src` is a document the plugin ships; `props` is JSON forwarded as the frame's props. The document's `invoke` is raised unresolved — `detail: { key, messageId?, payload?, blockId? }` — for the component to pass to `ctx.invoke(key, …)`, so the press meets this widget's actions and gate.
	 * Parts: `.sp-frame`.
	 * Events: `action`, `error`, `invoke`.
	 */
	'sp-frame': {
		'src'?: SpAttr
		'props'?: SpAttr
		'title'?: SpAttr
		'class'?: SpAttr
		slot?: string
	}
}

/** Every tag a component may place. @experimental 🚧 until C7 settles. */
export type SpHostTag = keyof SpHostElements

/** The events each tag raises, for `addEventListener` typing. @experimental 🚧 until C7 settles. */
export interface SpHostEvents {
	'button': 'click'
	'input': 'input' | 'change' | 'key' | 'blur'
	'textarea': 'input' | 'change'
	'a': 'click'
	'sp-popover': 'open-change'
	'sp-menu': 'select' | 'open-change'
	'sp-dialog': 'open-change'
	'sp-tabs': 'change'
	'sp-accordion': 'change'
	'sp-switch': 'change'
	'sp-slider': 'input' | 'change'
	'sp-combobox': 'input' | 'change'
	'sp-message-body': 'open-image'
	'sp-composer-field': 'input' | 'change' | 'submit' | 'key' | 'focus'
	'sp-scroll': 'reach-start'
	'sp-frame': 'action' | 'error' | 'invoke'
}
