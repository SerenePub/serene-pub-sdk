/**
 * `@serene-pub/core-catalog/actions` — the plain-TypeScript half of core's
 * Actions widget (PLAN-core-widgets W8): its settings, the grouping of the
 * session's listed actions, and the one view it draws — a button per action
 * with the verdict the composer's chips read. The widget's Svelte source
 * lives in `components/shared/actions/` and ships built
 * (`dist/components/actions.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * **The groups** come from fields `actions.v1` already carries, never from a
 * genre's name: an action from outside the genre's namespace (`origin:
 * 'foreign'`, switched on for it) is **added**; otherwise the **extra** venue
 * is the **turn controls** (Continue, Pick who speaks, Regenerate, …) and the
 * **composer** venue the **genre's** own. A message's actions (pressed on a
 * row) and a widget's own controls are other surfaces' and are not drawn.
 *
 * **The verdict** is the chips' (`paletteRowState`): the audience's sentence,
 * then the declared enabled-when's reason in the viewer's language. The
 * busy rule rides the listing (`session.generating` is a predicate the host
 * judges), and the `item.*` predicates of a turn control acting on the
 * newest row are left to the host's refusal: this widget reads no messages.
 * A greyed action stays listed with its reason, never hidden.
 *
 * 🚧 Provisional with the widget.
 */
import { actionIdentity, type ActionsV1, type WidgetAction } from '@serene-pub/sdk'
import { paletteRowState } from '../conversation/slashPalette.js'
import { statusTextIn } from '../conversation/text.js'

/** A translation: English source in, the viewer's words out. @experimental */
export type ActionsT = (source: string) => string

/**
 * One group of buttons: the **turn** controls (the `extra` venue), the
 * **genre**'s own (the `composer` venue), and the **foreign** actions — from
 * another namespace than the genre's, switched on for it. @experimental
 */
export type ActionsGroupKey = 'turn' | 'genre' | 'foreign'

/** The groups in the order they are drawn. @experimental */
export const ACTIONS_GROUP_ORDER: readonly ActionsGroupKey[] = Object.freeze([
	'turn',
	'genre',
	'foreign',
])

/** Each group's heading, English source. @experimental */
export const ACTIONS_GROUP_TITLES: Readonly<Record<ActionsGroupKey, string>> = Object.freeze({
	turn: 'Turn controls',
	genre: 'Genre actions',
	foreign: 'Added actions',
})

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface ActionsSettings {
	/** Every group, or one alone. */
	groups: 'all' | ActionsGroupKey
	/** `compact` — chips that wrap; `large` — a tile grid a finger lands on. */
	size: 'compact' | 'large'
	/**
	 * List the questions waiting on the viewer's answer. Declared, not drawn
	 * yet: no section this widget reads carries a session's open forms.
	 */
	showWaiting: boolean
}

/** @experimental */
export const ACTIONS_DEFAULTS: ActionsSettings = Object.freeze({
	groups: 'all',
	size: 'compact',
	showWaiting: true,
})

const GROUP_SETTINGS: readonly ActionsSettings['groups'][] = ['all', ...ACTIONS_GROUP_ORDER]

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readActionsSettings(raw: Record<string, unknown> | undefined): ActionsSettings {
	const v = raw ?? {}
	return {
		groups: GROUP_SETTINGS.includes(v.groups as ActionsSettings['groups'])
			? (v.groups as ActionsSettings['groups'])
			: ACTIONS_DEFAULTS.groups,
		size: v.size === 'compact' || v.size === 'large' ? v.size : ACTIONS_DEFAULTS.size,
		showWaiting:
			typeof v.showWaiting === 'boolean' ? v.showWaiting : ACTIONS_DEFAULTS.showWaiting,
	}
}

/**
 * The group one listed action belongs to, or null for one this widget does
 * not draw (a message's, a widget's own control, an admin surface's).
 * @experimental
 */
export function actionsGroupOf(a: Pick<WidgetAction, 'venue' | 'origin'>): ActionsGroupKey | null {
	if (a.venue !== 'extra' && a.venue !== 'composer') return null
	if (a.origin === 'foreign') return 'foreign'
	return a.venue === 'extra' ? 'turn' : 'genre'
}

/**
 * The listed actions by group, in the order drawn, each action once — its
 * venue's primary set first, then the overflow's rest. A group with nothing
 * in it is left out.
 * @experimental
 */
export function actionsGroups(
	actions: ActionsV1 | undefined,
	groups: ActionsSettings['groups'] = 'all',
): { key: ActionsGroupKey; actions: WidgetAction[] }[] {
	const by = new Map<ActionsGroupKey, WidgetAction[]>()
	const seen = new Set<string>()
	for (const venue of ['extra', 'composer'] as const) {
		const listed = actions?.[venue]
		if (!listed) continue
		for (const a of [...(listed.primary ?? []), ...(listed.overflow ?? [])]) {
			const group = actionsGroupOf(a)
			if (!group || (groups !== 'all' && group !== groups)) continue
			const identity = actionIdentity(a)
			if (seen.has(identity)) continue
			seen.add(identity)
			by.set(group, [...(by.get(group) ?? []), a])
		}
	}
	return ACTIONS_GROUP_ORDER.filter((k) => by.has(k)).map((key) => ({
		key,
		actions: by.get(key)!,
	}))
}

/** One button, as the widget draws it. @experimental */
export interface ActionsButtonView {
	/** `<spec slug>#<key>` — what a press invokes, and the row's key. */
	identity: string
	name: string
	/** A kebab-case icon name; `play` where the action declares none, as the overflow draws it. */
	icon: string
	/** What the icon says standing alone. */
	iconAlt: string
	description: string | null
	disabled: boolean
	/** Why it is greyed — the sentence the host refuses a press with. Null when it may be pressed. */
	reason: string | null
	/** The button's `title`: its name and why it is grey, else what it does. */
	title: string
	/** The viewer has not met this action yet. */
	isNew: boolean
}

/** @experimental */
export interface ActionsGroupView {
	key: ActionsGroupKey
	title: string
	buttons: ActionsButtonView[]
}

/** @experimental */
export interface ActionsView {
	groups: ActionsGroupView[]
	/** What an empty widget says instead. Null when there is a button. */
	empty: string | null
	/** The identities drawn wearing the *new* mark — what the widget tells the host it has met. */
	fresh: string[]
}

/** What `actionsView` reads. @experimental */
export interface ActionsInputs {
	actions: ActionsV1 | undefined
	settings: ActionsSettings
	/** `locale.v1`, for a listed reason's own words. */
	locale: string | undefined
	t: ActionsT
}

/**
 * Draw the session's actions: a group per kind, a button per action, each
 * with the chips' verdict and its reason.
 * @experimental
 */
export function actionsView(inputs: ActionsInputs): ActionsView {
	const { actions, settings, t } = inputs
	const locale = inputs.locale ?? 'en'
	const fresh: string[] = []
	const groups = actionsGroups(actions, settings.groups).map(({ key, actions: listed }) => ({
		key,
		title: t(ACTIONS_GROUP_TITLES[key]),
		buttons: listed.map((a): ActionsButtonView => {
			const identity = actionIdentity(a)
			const verdict = paletteRowState(
				{
					name: a.name,
					audience: { act: a.audience?.act ?? [] },
					canAct: a.canAct,
					...(a.enabled !== undefined ? { enabled: a.enabled } : {}),
					...(a.reason ? { reason: statusTextIn(a.reason, locale, t) } : {}),
					venue: a.venue,
				},
				{ generating: false },
			)
			// The chips' words as the chips say them (`Regenerate — wait for
			// the reply to finish`); a grey with no sentence still says so.
			const reason = verdict.disabled ? verdict.reason || t('not available right now') : null
			if (a.isNew) fresh.push(identity)
			return {
				identity,
				name: a.name,
				icon: a.icon || 'play',
				iconAlt: a.iconAlt || a.name,
				description: a.description ?? null,
				disabled: verdict.disabled,
				reason,
				title: reason
					? `${a.name} — ${reason}`
					: a.description
						? `${a.name} — ${a.description}`
						: a.name,
				isNew: !!a.isNew,
			}
		}),
	}))
	return {
		groups,
		empty: groups.length
			? null
			: settings.groups === 'all'
				? t('This session offers no actions here.')
				: t('This session offers none of these actions here.'),
		fresh,
	}
}
