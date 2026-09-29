/**
 * Channels and lanes (ruling 2026-09-09) — how a message's `channel` string is
 * read, by core and by a plugin, using one implementation.
 *
 * ## The two halves of a channel string
 *
 * A **channel** is an organizational bucket the genre chooses arbitrarily and
 * declares by slug (`SessionShape.channels`). A **lane** under that slug is
 * runtime and open-ended: a lane exists because a pipeline wrote to it, and the
 * genre's pipelines allocate and manage them. "One lane per agent, with the
 * agent↔lane map in the genre's extension data" and "five ongoing private
 * conversations in the cell-phone channel, more later" are the same mechanism.
 *
 * **No lane count is declared anywhere.** A genre declares slugs; the number of
 * lanes under one is a fact about what has been written, never a schema.
 *
 * ## Why the number is never the identity
 *
 * `main` is always the default channel and lane 1 is always the default lane, so
 * a bare slug *is* `slug:1` and `main` *is* `main:1`. Lane 1 is written as the
 * **bare slug** — that is the canonical storage form — which is why every row
 * written before lanes existed is already correct and why there was no
 * migration.
 *
 * The number is **multiplicity and order, never identity**: the slug is the
 * reference, and `text-messages:3` is the third conversation in the cell-phone
 * channel, not a channel called 3. A numeric id with a display slug was
 * considered and rejected for exactly that reason — it makes the ordinal
 * load-bearing and the name decorative, which is backwards.
 *
 * Lane metadata — a title, who is in it, whether it is still open — is the
 * genre's business and lives in its extension data. Core stores a string.
 *
 * ## Reading vs writing
 *
 * A read of a **bare slug** is the whole channel (every lane). A read of
 * `slug:1` is the default lane alone. That is the one place the distinction
 * between `parseChannel('main')` and `parseChannel('main:1')` matters, and it is
 * what `explicit` carries: both are lane 1, but only one of them *asked* for a
 * lane.
 *
 * A write always normalises through `formatChannel(parseChannel(x))`, so two
 * spellings of the same lane cannot land in the column as two lanes.
 */

/** The channel every session has, whatever its genre declares. @experimental */
export const DEFAULT_CHANNEL = 'main'

/** The lane every channel has. A bare slug means this one. @internal */
export const DEFAULT_LANE = 1

/** A channel string, taken apart. @experimental */
export interface ChannelRef {
	/** The genre-declared bucket. The reference; never a number. */
	slug: string
	/** Which lane under it, 1-based. `1` for a bare slug. */
	lane: number
	/**
	 * Whether the text actually named a lane.
	 *
	 * `main` and `main:1` are the same lane and format identically, but they
	 * are different *reads*: the first is the whole channel and the second is
	 * its default lane. Without this the two are indistinguishable after
	 * parsing, and "read the phone" silently becomes "read the first phone
	 * conversation".
	 */
	explicit: boolean
	/**
	 * Why the text was not taken at face value, when it was not.
	 *
	 * Carried as a value rather than logged, because this function is pure and
	 * runs in a plugin sandbox as readily as in the host: the caller that has
	 * somewhere to put a warning is the one that decides to. Its presence never
	 * means the parse failed — parsing a channel does not throw, on any input,
	 * because a malformed lane on a *read* must degrade to the default lane and
	 * not take a turn down with it.
	 */
	warning?: string
}

/** A positive, whole lane number, or `undefined` if the value is not one. */
function readLane(value: unknown): number | undefined {
	if (typeof value === 'number')
		return Number.isSafeInteger(value) && value >= 1 ? value : undefined
	if (typeof value !== 'string') return undefined
	// Deliberately strict: `1.5`, `+2`, `1e3`, ` 2 ` (already trimmed by the
	// caller) and an empty string are all *not* lane numbers. `Number()` would
	// accept most of them and quietly invent a lane.
	if (!/^[0-9]+$/.test(value)) return undefined
	const n = Number(value)
	return Number.isSafeInteger(n) && n >= 1 ? n : undefined
}

/**
 * Take a stored or requested channel apart.
 *
 * Never throws. Absent, blank, or non-string is the default channel's default
 * lane — the session always has one, so there is nothing to refuse.
 * @experimental
 */
export function parseChannel(raw: unknown): ChannelRef {
	if (typeof raw !== 'string')
		return { slug: DEFAULT_CHANNEL, lane: DEFAULT_LANE, explicit: false }

	const text = raw.trim()
	if (!text) return { slug: DEFAULT_CHANNEL, lane: DEFAULT_LANE, explicit: false }

	// The last colon, not the first: `:` is the lane separator, so a slug
	// cannot contain one and splitting from the right is the same answer with
	// one fewer way to be surprised.
	const cut = text.lastIndexOf(':')
	if (cut === -1) return { slug: text, lane: DEFAULT_LANE, explicit: false }

	const slug = text.slice(0, cut).trim()
	const laneText = text.slice(cut + 1).trim()

	if (!slug)
		return {
			slug: DEFAULT_CHANNEL,
			lane: DEFAULT_LANE,
			explicit: false,
			warning:
				`'${raw}' names a lane with no channel in front of it — read as ` +
				`'${DEFAULT_CHANNEL}'. A lane is a lane *of* a channel; the slug is the reference.`,
		}

	const lane = readLane(laneText)
	if (lane === undefined)
		return {
			slug,
			lane: DEFAULT_LANE,
			explicit: false,
			warning:
				`'${raw}' has no readable lane number — read as '${slug}', its default lane. ` +
				`A lane is a whole number from 1 up.`,
		}

	return { slug, lane, explicit: true }
}

/**
 * Write a channel back out in its canonical form.
 *
 * Lane 1 is the bare slug. This is the only shape that may reach the column: a
 * row stored as `main:1` and a row stored as `main` would be one lane wearing
 * two names, and every prefix read would then have to know both.
 * @experimental
 */
export function formatChannel(ref: { slug: string; lane?: number }): string {
	const slug = (typeof ref.slug === 'string' ? ref.slug.trim() : '') || DEFAULT_CHANNEL
	const lane = readLane(ref.lane) ?? DEFAULT_LANE
	return lane === DEFAULT_LANE ? slug : `${slug}:${lane}`
}

/**
 * Whether two channel strings name the same lane.
 *
 * Canonical equality, so `main` and `main:1` are the same lane and `phone` and
 * `phone:2` are not. `explicit` deliberately plays no part — it says how a read
 * was *phrased*, not which lane it landed on.
 * @internal
 */
export function isSameChannel(a: unknown, b: unknown): boolean {
	const x = parseChannel(a)
	const y = parseChannel(b)
	return x.slug === y.slug && x.lane === y.lane
}
