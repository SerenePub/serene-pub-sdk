/**
 * 🚧 **Composer states** (owner ruling 2026-10-15): whether a person's
 * composer is open on a channel lane, kept on the session row
 * (`sessions.composer_states`) and set by the genre alone, through
 * `core:outlet/set-composer-state@1`. Core opens and closes nothing on its
 * own.
 *
 * The stored document is channel → who → closure:
 *
 * ```json
 * { "main": { "user:7": { "open": false, "reason": "Make your character on the Planner tab first." } },
 *   "*":    { "*": { "open": false } } }
 * ```
 *
 * - a **channel** key is canonical (`parley:2`; lane 1 is the bare slug, so
 *   `parley` is lane 1 alone), or `*` for every channel;
 * - a **who** key is `user:<id>` for one person, or `*` for everyone — the
 *   session's owner included (the genre decides);
 * - absent is open. Nothing stores an open composer.
 *
 * A composer is closed when any entry naming its lane (or `*`) and its person
 * (or `*`) is present, and the reason is the most specific one: the lane's
 * own entry for that person, then the lane's for everyone, then `*`'s.
 * Opening never overrides a broader close: opening Story for one person
 * while it is closed for everyone leaves it closed for them.
 *
 * Not `enabledWhen`: a composer state is written state, not a predicate.
 * The send door refuses a line on a closed composer with the reason in its
 * sentence; the widget envelope carries the viewer's closures
 * (`ConversationComposerV1.closed`) so a composer can grey itself.
 * @experimental
 */
import { formatChannel, parseChannel } from './channels.js'

/** Every channel, as a composer-state channel key, and everyone, as its who key. @experimental */
export const COMPOSER_STATE_ANY = '*'

/** One closed composer: who, on which lane, and why. @experimental */
export interface ComposerClosureV1 {
	open: false
	/** What the composer is waiting on, as a sentence the person reads ("Make your character first."). */
	reason?: string
}

/** The session row's `composer_states`: channel → who → closure. @experimental */
export type ComposerStatesV1 = Record<string, Record<string, ComposerClosureV1>>

/** What `set-composer-state@1` is handed, read. @experimental */
export interface ComposerStateChange {
	/** A slug, a canonical lane (`parley:2`), or `*`. */
	channel: string
	open: boolean
	reason?: string
	/** `user:<id>`, or absent for everyone. */
	person?: string | null
}

/** A channel as a composer-state key: canonical, or `*`. @experimental */
export function composerStateChannel(channel: unknown): string {
	if (typeof channel === 'string' && channel.trim() === COMPOSER_STATE_ANY) return COMPOSER_STATE_ANY
	return formatChannel(parseChannel(channel))
}

const PERSON = /^user:(\d+)$/

/** A person as a composer-state who key (`user:<id>`), `*` for absent; null when it is neither. @experimental */
export function composerStatePerson(person: unknown): string | null {
	if (person === undefined || person === null || person === '' || person === COMPOSER_STATE_ANY)
		return COMPOSER_STATE_ANY
	if (typeof person !== 'string') return null
	const m = PERSON.exec(person.trim())
	return m ? `user:${Number(m[1])}` : null
}

/** A stored value, read as a document: anything else is no closures. @experimental */
export function readComposerStates(raw: unknown): ComposerStatesV1 {
	const out: ComposerStatesV1 = {}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
	for (const [channel, whos] of Object.entries(raw as Record<string, unknown>)) {
		if (!whos || typeof whos !== 'object' || Array.isArray(whos)) continue
		const kept: Record<string, ComposerClosureV1> = {}
		for (const [who, c] of Object.entries(whos as Record<string, unknown>)) {
			if (!c || typeof c !== 'object') continue
			const reason = (c as { reason?: unknown }).reason
			kept[who] = {
				open: false,
				...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
			}
		}
		if (Object.keys(kept).length) out[channel] = kept
	}
	return out
}

/**
 * The document after one change — a new object; `states` is not touched.
 *
 * - close: the entry at (channel, who) is written, its reason replaced;
 * - open for everyone on a channel: the channel's every entry goes (`*`:
 *   every entry on every channel);
 * - open for one person: their entry on that channel goes (`*`: theirs on
 *   every channel); an everyone-entry stays.
 * @experimental
 */
export function applyComposerState(states: unknown, change: ComposerStateChange): ComposerStatesV1 {
	const next = readComposerStates(states)
	const channel = composerStateChannel(change.channel)
	const who = composerStatePerson(change.person)
	if (who === null) return next
	if (!change.open) {
		const reason = typeof change.reason === 'string' ? change.reason.trim() : ''
		next[channel] = { ...(next[channel] ?? {}), [who]: { open: false, ...(reason ? { reason } : {}) } }
		return next
	}
	const channels = channel === COMPOSER_STATE_ANY ? Object.keys(next) : [channel]
	for (const ch of channels) {
		if (!next[ch]) continue
		if (who === COMPOSER_STATE_ANY) delete next[ch]
		else {
			const { [who]: _gone, ...rest } = next[ch]
			if (Object.keys(rest).length) next[ch] = rest
			else delete next[ch]
		}
	}
	return next
}

/**
 * The closure on `channel` for the person `userId` (null: nobody, e.g. a
 * check for everyone), or null when that composer is open. Most specific
 * first: the lane's entry for them, the lane's for everyone, then `*`'s.
 * @experimental
 */
export function composerClosureFor(
	states: unknown,
	channel: unknown,
	userId: number | null,
): ComposerClosureV1 | null {
	const doc = readComposerStates(states)
	const lane = composerStateChannel(channel)
	const me = userId != null ? `user:${userId}` : null
	for (const ch of [lane, COMPOSER_STATE_ANY]) {
		const whos = doc[ch]
		if (!whos) continue
		if (me && whos[me]) return whos[me]
		if (whos[COMPOSER_STATE_ANY]) return whos[COMPOSER_STATE_ANY]
	}
	return null
}

/**
 * Every closure that reaches one person, by channel key — `*` kept as a key,
 * so a composer on a lane nobody listed is still closed by it. What the page
 * hands the composer as `ConversationComposerV1.closed`; read it with
 * `composerClosedOn`.
 * @experimental
 */
export function composerClosuresFor(
	states: unknown,
	userId: number | null,
): Record<string, { reason?: string }> {
	const doc = readComposerStates(states)
	const out: Record<string, { reason?: string }> = {}
	for (const ch of Object.keys(doc)) {
		const c = composerClosureFor({ [ch]: doc[ch] }, ch, userId)
		if (c) out[ch] = c.reason ? { reason: c.reason } : {}
	}
	return out
}

/**
 * Whether a composer writing on `lane` is closed, read from the envelope's
 * `closed` map: the lane's own entry, else `*`'s; undefined when open.
 * @experimental
 */
export function composerClosedOn(
	closed: Record<string, { reason?: string }> | undefined | null,
	lane: unknown,
): { reason?: string } | undefined {
	if (!closed) return undefined
	return closed[composerStateChannel(lane)] ?? closed[COMPOSER_STATE_ANY]
}

/**
 * The sentence a send on a closed composer is refused with — the reason
 * repeated when there is one.
 * @experimental
 */
export function composerClosedRefusal(closure: { reason?: string } | null | undefined): string {
	const reason = closure?.reason?.trim()
	return reason ? `You can't send here yet. ${reason}` : COMPOSER_CLOSED_NO_REASON
}

/** Said, and shown in place of the placeholder, by a closed composer the genre gave no reason. @experimental */
export const COMPOSER_CLOSED_NO_REASON = "You can't send here yet."

/**
 * What a closed composer shows in place of its placeholder: `Waiting: ` and
 * the reason, else `COMPOSER_CLOSED_NO_REASON`.
 * @experimental
 */
export function composerClosedPlaceholder(closure: { reason?: string } | null | undefined): string {
	const reason = closure?.reason?.trim()
	return reason ? `Waiting: ${reason}` : COMPOSER_CLOSED_NO_REASON
}
