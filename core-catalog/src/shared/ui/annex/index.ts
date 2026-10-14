/**
 * `@serene-pub/core-catalog/annex` — the plain-TypeScript half of core's
 * Annex widget (PLAN-core-widgets W9): its settings, what it knows of one
 * declared annex field, and the one view it draws — one annex key, by its
 * label, in the shape it was declared in. The widget's Svelte source lives
 * in `components/shared/annex/` and ships built (`dist/components/annex.js`);
 * a host imports only this half, which carries no Svelte runtime.
 *
 * **The key** is `<owner>.<key>`, the way a template reads it
 * (`annex.<owner>.<key>`): `core.retake-quietly`, a plugin's
 * `acme.dice.last-roll`. A field's key is a kebab token with no dot
 * (`ANNEX_FIELD_KEY`), so the last dot splits, whatever the owner's slug.
 *
 * **What it draws** is the viewer's own view of the annex (`annex.v1`) — the
 * values whose `see` audience holds for them, never the annex itself. Text
 * is prose; a number, a switch or a choice is one label/value row; a list is
 * chips; an object is a row per member. The declared shape decides when the
 * widget is handed one; otherwise the stored value's own form does.
 *
 * **What it knows of the field** is what the host lists (`actions.v1`): a
 * field a person may set is one action at the `widget` venue
 * (`<owner>:annex#<key>`), named by the field's label and judged for the
 * viewer (`canAct`) — so the label and *may I edit* are the host's, never
 * worked out here. A field nobody may set reaches no listing, and is titled
 * by its key. ⚠ Neither the declared shape nor the `see` verdict reaches a
 * widget today; `AnnexWidgetField` takes both, for a host that hands them.
 *
 * **Edit** is the Session data list's: a text field the viewer may set,
 * saved by pressing its ready-made action with `{ value }` — the same door,
 * the same write.
 *
 * 🚧 Provisional with the widget.
 */
import {
	ANNEX_FIELD_KEY,
	ANNEX_FIELD_SLUG_SUFFIX,
	annexFieldAction,
	i18nText,
	type ActionsV1,
	type AnnexV1,
	type FieldDecl,
	type I18n,
	type ViewerV1,
} from '@serene-pub/sdk'

/** A translation: English source in, the viewer's words out. @experimental */
export type AnnexWidgetT = (source: string) => string

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface AnnexWidgetSettings {
	/** The annex key it draws, `<owner>.<key>`; `''` until one is picked. */
	key: string
	/** Draw the field's label above its value. */
	showLabel: boolean
}

/** @experimental */
export const ANNEX_WIDGET_DEFAULTS: AnnexWidgetSettings = Object.freeze({
	key: '',
	showLabel: false,
})

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readAnnexWidgetSettings(
	raw: Record<string, unknown> | undefined,
): AnnexWidgetSettings {
	const v = raw ?? {}
	return {
		key: typeof v.key === 'string' ? v.key.trim() : ANNEX_WIDGET_DEFAULTS.key,
		showLabel: typeof v.showLabel === 'boolean' ? v.showLabel : ANNEX_WIDGET_DEFAULTS.showLabel,
	}
}

/**
 * `<owner>.<key>` taken apart at its last dot — null for anything that is
 * not one (no dot, an empty owner, a key that is not a kebab token).
 * @experimental
 */
export function parseAnnexWidgetKey(
	raw: string | undefined,
): { owner: string; key: string } | null {
	const s = (raw ?? '').trim()
	const at = s.lastIndexOf('.')
	if (at <= 0) return null
	const owner = s.slice(0, at)
	const key = s.slice(at + 1)
	if (!ANNEX_FIELD_KEY.test(key) || owner.includes('#') || /\s/.test(owner)) return null
	return { owner, key }
}

/**
 * What the widget knows of one declared annex field. Each fact is optional
 * because each has its own source, and the widget draws what it is given:
 * the label and `canAct` come from the host's listing
 * ({@link annexWidgetFieldsFrom}); `shape` and `canSee` from a host that
 * hands the declaration (none does yet).
 * @experimental
 */
export interface AnnexWidgetField {
	owner: string
	key: string
	label?: I18n
	/** The declared shape — what the value is drawn as. Absent: the value's own form. */
	shape?: FieldDecl
	/** The host's verdict on the field's `act` audience for this viewer. */
	canAct?: boolean
	/** The host's verdict on the field's `see` audience for this viewer. */
	canSee?: boolean
}

/**
 * The annex fields the host lists for this viewer: each settable field it may
 * set is one action at the `widget` venue whose spec slug is `<owner>:annex`,
 * its key the field's, its name the field's label. Disabled for this session
 * (`enabled: false`) or not the viewer's to press (`canAct: false`), it is
 * known but not settable.
 * @experimental
 */
export function annexWidgetFieldsFrom(actions: ActionsV1 | undefined): AnnexWidgetField[] {
	const out: AnnexWidgetField[] = []
	const seen = new Set<string>()
	const venue = actions?.widget
	for (const a of [...(venue?.primary ?? []), ...(venue?.overflow ?? [])]) {
		const slug = a.specSlug ?? ''
		if (
			!slug.endsWith(ANNEX_FIELD_SLUG_SUFFIX) ||
			slug.length <= ANNEX_FIELD_SLUG_SUFFIX.length
		)
			continue
		const owner = slug.slice(0, -ANNEX_FIELD_SLUG_SUFFIX.length)
		const id = `${owner}.${a.key}`
		if (seen.has(id)) continue
		seen.add(id)
		out.push({
			owner,
			key: a.key,
			...(a.name ? { label: a.name } : {}),
			canAct: !!a.canAct && a.enabled !== false,
		})
	}
	return out
}

/** One label/value row. @experimental */
export interface AnnexWidgetRow {
	/** The member's key — the row's key; the field's own key for a one-row value. */
	key: string
	label: string
	text: string
}

/** How the value is drawn. @experimental */
export type AnnexWidgetDrawn =
	| { as: 'prose'; text: string }
	| { as: 'rows'; rows: AnnexWidgetRow[] }
	| { as: 'chips'; chips: string[] }

/** The three things the widget says instead of a value. @experimental */
export type AnnexWidgetEmptyState = 'pick' | 'unwritten' | 'hidden'

/** Each empty state's line, English source. @experimental */
export const ANNEX_WIDGET_EMPTY: Readonly<Record<AnnexWidgetEmptyState, string>> = Object.freeze({
	pick: 'Pick a key in settings',
	unwritten: 'Nothing written yet',
	hidden: "You can't see this",
})

/** The widget's one view. @experimental */
export type AnnexWidgetView =
	| {
			state: AnnexWidgetEmptyState
			/** The field's label, its key without one; *Annex* with no key picked. */
			title: string
			empty: string
			/** `<owner>:annex#<key>` — what a Save presses. Null with no key picked. */
			identity: string | null
			/** May the viewer write the first value here (the Session data list's Edit). */
			canEdit: boolean
			/** The editor's starting text. */
			draft: string
	  }
	| {
			state: 'value'
			title: string
			/** The declared shape's type, else the value's own form (`text`, `integer`, `list`, …). */
			shape: string
			drawn: AnnexWidgetDrawn
			value: unknown
			identity: string
			canEdit: boolean
			draft: string
	  }

/** What `annexWidgetView` reads. @experimental */
export interface AnnexWidgetInputs {
	/** `annex.v1` — the viewer's view of the annex. */
	annex: AnnexV1 | undefined
	/** What the widget knows of the declared fields ({@link annexWidgetFieldsFrom}). */
	fields: readonly AnnexWidgetField[]
	/** The `key` setting, `<owner>.<key>`. */
	key: string
	viewer: ViewerV1 | undefined
	/** `locale.v1`, for a label's and a member's own words. */
	locale?: string
	t?: AnnexWidgetT
}

const humanise = (s: string): string =>
	s
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/^./, (c) => c.toUpperCase())

/** The value's own form, when no declaration says: what it would be declared as. @internal */
function typeOfValue(value: unknown): string {
	if (typeof value === 'string') return 'text'
	if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
	if (typeof value === 'boolean') return 'boolean'
	if (Array.isArray(value)) return 'list'
	if (value && typeof value === 'object') return 'object'
	return 'text'
}

/** Nothing written: absent, null, blank text, an empty list or object. @internal */
function isBlank(value: unknown): boolean {
	if (value === undefined || value === null) return true
	if (typeof value === 'string') return !value.trim()
	if (Array.isArray(value)) return value.length === 0
	if (typeof value === 'object') return Object.keys(value as object).length === 0
	return false
}

/** One scalar in the viewer's words, by its declaration where there is one. @internal */
function textOf(
	value: unknown,
	shape: FieldDecl | undefined,
	locale: string,
	t: AnnexWidgetT,
): string {
	if (value === undefined || value === null) return '—'
	if (shape?.type === 'enum' && typeof value === 'string') {
		const member = shape.members?.find((m) => m.key === value)
		return i18nText(member?.label, locale) ?? humanise(value)
	}
	if (typeof value === 'boolean') return value ? t('Yes') : t('No')
	if (typeof value === 'number') {
		try {
			return new Intl.NumberFormat(locale).format(value)
		} catch {
			return String(value)
		}
	}
	if (typeof value === 'string') return value
	if (Array.isArray(value)) return value.map((v) => textOf(v, shape?.item, locale, t)).join(', ')
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

/** The value drawn by its shape. @internal */
function drawnOf(
	value: unknown,
	type: string,
	shape: FieldDecl | undefined,
	label: string,
	key: string,
	locale: string,
	t: AnnexWidgetT,
): AnnexWidgetDrawn {
	switch (type) {
		case 'text':
		case 'string':
			return {
				as: 'prose',
				text: typeof value === 'string' ? value : textOf(value, undefined, locale, t),
			}
		case 'list':
		case 'string[]':
			if (Array.isArray(value))
				return {
					as: 'chips',
					chips: value.map((v) =>
						textOf(v, type === 'list' ? shape?.item : undefined, locale, t),
					),
				}
			break
		case 'object':
		case 'share':
		case 'perMember':
		case 'strengths': {
			if (!value || typeof value !== 'object' || Array.isArray(value)) break
			const v = value as Record<string, unknown>
			// Declared members in their declared order, then whatever else is stored.
			const declared: { key: string; label?: I18n; shape?: FieldDecl }[] =
				type === 'object'
					? Object.entries(shape?.fields ?? {}).map(([k, d]) => ({
							key: k,
							label: d.label,
							shape: d,
						}))
					: (shape?.members ?? []).map((m) => ({ key: m.key, label: m.label }))
			const keys = [
				...declared.map((d) => d.key),
				...Object.keys(v).filter((k) => !declared.some((d) => d.key === k)),
			]
			return {
				as: 'rows',
				rows: keys
					.filter((k) => v[k] !== undefined)
					.map((k) => {
						const d = declared.find((x) => x.key === k)
						return {
							key: k,
							label: i18nText(d?.label, locale) ?? humanise(k),
							text: textOf(v[k], d?.shape, locale, t),
						}
					}),
			}
		}
	}
	if (type === 'text' || type === 'string')
		return { as: 'prose', text: textOf(value, shape, locale, t) }
	return { as: 'rows', rows: [{ key, label, text: textOf(value, shape, locale, t) }] }
}

/**
 * Draw one annex key: an empty state, each one line and never silent, or the
 * value in its shape, with the Session data list's Edit where the viewer may
 * set it.
 *
 * - no key, or not `<owner>.<key>` → *Pick a key in settings*, titled *Annex*;
 * - in the viewer's view → the value;
 * - not in it, and the host says the viewer may not see it → *You can't
 *   see this*;
 * - otherwise → *Nothing written yet*. ⚠ A key the viewer may not see is
 *   absent from their view exactly as an unwritten one is, so without the
 *   host's `see` verdict the two read alike.
 *
 * **Edit** needs all three: the host lists the field as the viewer's to set
 * (`canAct`), the viewer holds no guest seat, and the field is text — by its
 * declared shape, else by the stored value's form (the Session data list's
 * rule, `annexEditsAsText`).
 * @experimental
 */
export function annexWidgetView(inputs: AnnexWidgetInputs): AnnexWidgetView {
	const t = inputs.t ?? ((s: string) => s)
	const locale = inputs.locale ?? 'en'
	const parsed = parseAnnexWidgetKey(inputs.key)
	if (!parsed)
		return {
			state: 'pick',
			title: t('Annex'),
			empty: t(ANNEX_WIDGET_EMPTY.pick),
			identity: null,
			canEdit: false,
			draft: '',
		}
	const { owner, key } = parsed
	const field = inputs.fields.find((f) => f.owner === owner && f.key === key)
	const title = i18nText(field?.label, locale) || key
	const identity = annexFieldAction(owner, key)
	const doc = inputs.annex?.[owner]
	const value = doc && typeof doc === 'object' ? (doc as Record<string, unknown>)[key] : undefined
	const blank = isBlank(value)
	const type = field?.shape?.type ?? (blank ? undefined : typeOfValue(value))
	const canEdit =
		!!field?.canAct && !inputs.viewer?.isGuest && (type === 'text' || type === 'string')
	const draft = typeof value === 'string' ? value : ''
	if (blank) {
		const state: AnnexWidgetEmptyState =
			field?.canSee === false && value === undefined ? 'hidden' : 'unwritten'
		return { state, title, empty: t(ANNEX_WIDGET_EMPTY[state]), identity, canEdit, draft }
	}
	const shapeType = type ?? 'text'
	return {
		state: 'value',
		title,
		shape: shapeType,
		drawn: drawnOf(value, shapeType, field?.shape, title, key, locale, t),
		value,
		identity,
		canEdit,
		draft,
	}
}
