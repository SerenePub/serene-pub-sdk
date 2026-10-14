/**
 * `@serene-pub/core-catalog/turn-order` — the plain-TypeScript half of
 * core's Turn order widget (PLAN-core-widgets W1): its settings, the strategy
 * names, and the one view it draws from the session's stored turn order —
 * the head line, the rows, and whether Continue and Pick who speaks may be
 * pressed and why not. The widget's Svelte source lives in
 * `components/shared/turn-order/` and ships built
 * (`dist/components/turn-order.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * The head line means what the composer's *Who is due next* line means
 * (`NextCharacterBlock`): the same `order[0]`, named from the same
 * `candidates`, in the same words. It is never recomputed here — the order
 * is the session's state (`turnOrder.v1`), and this only reads it.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget.
 */
import {
	CORE_ACTION_SPEC_ID,
	localeMapOf,
	renderStatusText,
	type ActionsV1,
	type SessionCharactersV1,
	type TurnCandidateV1,
	type TurnEntryV1,
	type TurnOrderV1,
	type ViewerV1,
	type WidgetAction,
} from '@serene-pub/sdk'

/** A translation: English source in, the viewer's words out. @experimental */
export type TurnOrderT = (source: string) => string

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface TurnOrderSettings {
	/** Name the strategy that set the order, under the controls. */
	showStrategy: boolean
	/** Draw each row's face beside its name. */
	faces: boolean
	/**
	 * List the benched characters under the order (W6, 2026-10-11): in the
	 * session, switched off in Participants, out of the turns. Off by default.
	 */
	showBenched: boolean
}

/** @experimental */
export const TURN_ORDER_DEFAULTS: TurnOrderSettings = Object.freeze({
	showStrategy: true,
	faces: true,
	showBenched: false,
})

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readTurnOrderSettings(raw: Record<string, unknown> | undefined): TurnOrderSettings {
	const v = raw ?? {}
	return {
		showStrategy:
			typeof v.showStrategy === 'boolean' ? v.showStrategy : TURN_ORDER_DEFAULTS.showStrategy,
		faces: typeof v.faces === 'boolean' ? v.faces : TURN_ORDER_DEFAULTS.faces,
		showBenched:
			typeof v.showBenched === 'boolean' ? v.showBenched : TURN_ORDER_DEFAULTS.showBenched,
	}
}

/**
 * The names core's turn strategies go by, keyed by definition id without its
 * version — the names their declarations carry (`@serene-pub/contracts`,
 * `turnRoundRobin` … `turnAdvise`), and the ones `docs/group-sessions.md`
 * lists under **Strategy**. Copied rather than imported so the widget's
 * bundle does not carry the contracts; a catalogue test holds the two equal.
 * @experimental
 */
export const TURN_STRATEGY_NAMES: Readonly<Record<string, string>> = Object.freeze({
	'core:task/turn-round-robin': 'Round robin',
	'core:task/turn-user-split': 'Round robin by user',
	'core:task/turn-random': 'Random',
	'core:task/turn-scripted': 'Scripted',
	'core:task/turn-manual': 'Manual',
	'core:task/turn-narrator': 'Narrator replies',
	'core:oracle/turn-advise': 'Model decides who speaks',
})

/** A definition id with every trailing `@<version>` taken off: `core:task/turn-manual@1` → `core:task/turn-manual`. */
const bareDefinitionId = (id: string): string => id.replace(/(?:@\d+)+$/, '')

/**
 * What `turnOrder.v1.strategy` is called: core's strategies by their names,
 * any other (a plugin's) by its definition's own slug — `acme:task/dice@1` →
 * `dice` — rather than nothing. Null when the order names no strategy.
 * @experimental
 */
export function turnStrategyName(
	strategy: string | null | undefined,
	t: TurnOrderT,
): string | null {
	if (!strategy) return null
	const bare = bareDefinitionId(strategy)
	const known = TURN_STRATEGY_NAMES[bare]
	if (known) return t(known)
	const slug = bare.slice(bare.lastIndexOf('/') + 1)
	return slug || null
}

/**
 * A row's chip: **due** — the head, whose turn it is now; **then** — prepared
 * after it; **you** — a turn that is the viewer's own persona's, wherever it
 * stands; **benched** — a character out of the turns, listed under the order
 * with `showBenched` (W6).
 * @experimental
 */
export type TurnRowState = 'due' | 'then' | 'you' | 'benched'

/** One prepared turn, as the widget draws it. @experimental */
export interface TurnRowView {
	/** Unique within the view (the same participant may hold two entries, on two channels). */
	key: string
	/** Who: a participant reference, or null for the pipeline's own voice (a narrator turn). */
	ref: string | null
	/** `character` · `persona` · `envoy` (the candidate's `kind`), or `voice` for a null ref. */
	kind: string
	name: string
	/** The member's face, resolved by the host (`characters.v1`); null when there is none or faces are off. */
	face: string | null
	state: TurnRowState
	/** The row's chip text. */
	chip: string
	/** Where the entry fires: its `channel`, `main` when it names none. */
	channel: string
}

/** Whether a control may be pressed, and the sentence that says why not. @experimental */
export interface TurnControlView {
	enabled: boolean
	/** Why it is greyed — the control's `title`. Null when enabled. */
	reason: string | null
}

/** @experimental */
export interface TurnOrderView {
	/**
	 * `ordered` — at least one prepared turn; `waiting` — none prepared but
	 * someone could take one (a round that is over, a Manual strategy);
	 * `empty` — nobody to take a turn at all.
	 */
	status: 'ordered' | 'waiting' | 'empty'
	/** The head line: the composer's *Who is due next* line, word for word. Null when `empty`. */
	head: string | null
	/** The head row's face, when it has one (and faces are on). */
	headFace: string | null
	/** The head is the pipeline's own voice (a narrator turn): drawn with the narrator's glyph. */
	headIsVoice: boolean
	/** What an `empty` order says instead — why it is empty. Null otherwise. */
	empty: string | null
	rows: TurnRowView[]
	/**
	 * The benched characters (`SessionCharacterV1.benched`), in the cast's
	 * order, as rows under the order — empty unless `showBenched`. 🚧 W6.
	 */
	benched: TurnRowView[]
	/** Continue (`fire-turn`), with the channel of the entry it fires. */
	continueTurn: TurnControlView & { channel?: string; label: string }
	/** Pick who speaks (`pick-turn`). */
	pick: TurnControlView
	/** The strategy line (`Strategy: Round robin`), or null when hidden or unnamed. */
	strategy: string | null
}

/** Everything the view is drawn from: the widget's sections. @experimental */
export interface TurnOrderInputs {
	turnOrder: TurnOrderV1 | undefined
	/** `characters.v1`, for faces and `mine`; absent when not granted. */
	characters?: SessionCharactersV1
	viewer: ViewerV1
	/** `actions.v1`: a genre that declares turn controls lists `core#advance` / `core#pick` there. */
	actions?: ActionsV1
	settings: TurnOrderSettings
	/** `locale.v1`, for a turn control's own reason. */
	locale?: string
	t: TurnOrderT
}

/** What the pipeline's own voice is called — `NextCharacterBlock`'s fallback when no page names it. */
const OWN_VOICE = 'The narrator'

const channelOf = (e: TurnEntryV1): string =>
	typeof e.channel === 'string' && e.channel ? e.channel : 'main'

/** Core's turn control `key` (`core#advance`, `core#pick`) as the session lists it, when it does. */
function turnControl(
	actions: ActionsV1 | undefined,
	key: 'advance' | 'pick',
): WidgetAction | undefined {
	for (const venue of Object.values(actions ?? {}))
		for (const a of [...(venue?.primary ?? []), ...(venue?.overflow ?? [])])
			if (a.specSlug === CORE_ACTION_SPEC_ID && a.key === key) return a
	return undefined
}

/**
 * The verdict a listed turn control carries — the host's own (audience and
 * enabled-when, judged on the server) — or null when the session lists none.
 */
function listedVerdict(
	a: WidgetAction | undefined,
	locale: string,
	t: TurnOrderT,
): TurnControlView | null {
	if (!a) return null
	if (!a.canAct)
		return { enabled: false, reason: t('You may not move the turns on in this session.') }
	if (a.enabled === false) {
		if (!a.reason) return { enabled: false, reason: t('Not available right now.') }
		const i18n = localeMapOf(a.reason.i18n)
		const sentence =
			i18n[locale] !== undefined
				? renderStatusText(a.reason, locale)
				: renderStatusText({ ...a.reason, i18n: { en: t(i18n.en) } })
		return { enabled: false, reason: sentence.charAt(0).toUpperCase() + sentence.slice(1) }
	}
	return { enabled: true, reason: null }
}

/**
 * Draw the session's turn order: the head line, a row per prepared turn,
 * and the two controls.
 *
 * Who may press: where the genre declares turn controls the session lists
 * `core#advance` and `core#pick`, and their own verdict decides (the host's
 * audience and enabled-when, the same the composer's chips show). Where it
 * lists none, a guest with no seat in the order — no candidate of theirs —
 * may watch but not move the turns on (`ViewerV1.isGuest`: may read, may not
 * write); anyone else may. Either way a control is greyed with its reason,
 * never hidden.
 * @experimental
 */
export function turnOrderView(input: TurnOrderInputs): TurnOrderView {
	const { t, settings, viewer } = input
	const doc = input.turnOrder
	const order = doc?.order ?? []
	const candidates = doc?.candidates ?? []
	const members = input.characters?.members ?? []
	const byRef = new Map<string, TurnCandidateV1>(candidates.map((c) => [c.ref, c]))
	const memberOf = (ref: string | null) => (ref ? members.find((m) => m.ref === ref) : undefined)

	const nameOf = (ref: string | null): string => {
		if (ref === null) return t(OWN_VOICE)
		const c = byRef.get(ref)
		return c?.nickname || c?.name || memberOf(ref)?.name || t('Someone')
	}
	const kindOf = (ref: string | null): string =>
		ref === null ? 'voice' : (byRef.get(ref)?.kind ?? 'character')
	const isPerson = (ref: string | null) => ref !== null && byRef.get(ref)?.kind === 'persona'
	const isMine = (ref: string | null): boolean => {
		if (!isPerson(ref)) return false
		if (memberOf(ref)?.mine) return true
		const owner = byRef.get(ref as string)?.ownerUserId
		return viewer.userId != null && owner === viewer.userId
	}
	const faceOf = (ref: string | null): string | null =>
		settings.faces ? (memberOf(ref)?.face ?? null) : null

	const chips: Record<TurnRowState, string> = {
		due: t('Due'),
		then: t('Then'),
		you: t('You'),
		benched: t('Benched'),
	}
	const rows: TurnRowView[] = order.map((e, i) => {
		const state: TurnRowState = isMine(e.ref) ? 'you' : i === 0 ? 'due' : 'then'
		return {
			key: `${i}:${e.ref ?? 'voice'}@${channelOf(e)}`,
			ref: e.ref,
			kind: kindOf(e.ref),
			name: nameOf(e.ref),
			face: faceOf(e.ref),
			state,
			chip: chips[state],
			channel: channelOf(e),
		}
	})

	const head = order[0]
	const headName = head ? nameOf(head.ref) : ''
	const headIsPerson = !!head && isPerson(head.ref)
	const headIsMine = !!head && isMine(head.ref)

	const status: TurnOrderView['status'] = head
		? 'ordered'
		: candidates.length
			? 'waiting'
			: 'empty'
	const headLine =
		status === 'empty'
			? null
			: status === 'waiting'
				? t('Waiting for a message — or pick who speaks next')
				: headIsMine
					? t('Your turn')
					: headIsPerson
						? t("{name}'s turn").replace('{name}', headName)
						: t('{name} is ready to continue').replace('{name}', headName)
	const empty =
		status !== 'empty'
			? null
			: (doc?.computedAt ?? 0) === 0
				? t('No turn order yet. It is worked out after the next message.')
				: t(
						'Nobody is seated to take a turn. Add a character, or switch one on in Edit session › Participants.',
					)

	// Who may press, where the session lists no turn controls of its own.
	const holdsSeat =
		(viewer.userId != null && candidates.some((c) => c.ownerUserId === viewer.userId)) ||
		members.some((m) => m.mine)
	const watching: TurnControlView | null =
		viewer.isGuest && !holdsSeat
			? {
					enabled: false,
					reason: t(
						'Guests without a seat in this session can watch the turns, not take them.',
					),
				}
			: null
	const locale = input.locale ?? 'en'

	const advance = listedVerdict(turnControl(input.actions, 'advance'), locale, t)
	const continueTurn: TurnOrderView['continueTurn'] = (() => {
		const label =
			head && !headIsPerson
				? t('Continue with {name}').replace('{name}', headName)
				: t('Continue')
		const channel = head ? channelOf(head) : undefined
		const gate = advance ?? watching
		if (gate && !gate.enabled) return { ...gate, label, ...(channel ? { channel } : {}) }
		// Nothing prepared: a genre that lists Continue lets its OWNER carry
		// on (a narrator turn, lair pass B9) — the server's rule; anyone else
		// would only be told what this says.
		if (!head)
			return advance?.enabled && !viewer.isGuest
				? { enabled: true, reason: null, label }
				: { enabled: false, reason: t('Nothing is prepared to take a turn.'), label }
		if (headIsPerson)
			return {
				enabled: false,
				reason: t("A person's turn is taken by writing."),
				label,
				channel,
			}
		return { enabled: true, reason: null, label, channel }
	})()

	const seatable = candidates.some((c) => c.kind !== 'persona')
	const picked = listedVerdict(turnControl(input.actions, 'pick'), locale, t)
	const pick: TurnControlView = (() => {
		const gate = picked ?? watching
		if (gate && !gate.enabled) return gate
		if (!seatable) return { enabled: false, reason: t('Nobody is seated to pick.') }
		return { enabled: true, reason: null }
	})()

	const named = settings.showStrategy ? turnStrategyName(doc?.strategy, t) : null
	// Benched characters are listed only when asked: they are not in the order.
	const benched: TurnRowView[] = settings.showBenched
		? members
				.filter((m) => m.benched && !m.isPersona)
				.map((m) => ({
					key: `benched:${m.ref}`,
					ref: m.ref,
					kind: 'character',
					name: m.name,
					face: settings.faces ? m.face : null,
					state: 'benched' as const,
					chip: chips.benched,
					channel: 'main',
				}))
		: []
	return {
		status,
		head: headLine,
		headFace: head ? faceOf(head.ref) : null,
		headIsVoice: !!head && head.ref === null,
		empty,
		rows,
		benched,
		continueTurn,
		pick,
		strategy: named ? t('Strategy: {name}').replace('{name}', named) : null,
	}
}
