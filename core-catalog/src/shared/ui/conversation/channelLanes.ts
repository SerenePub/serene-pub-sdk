/**
 * 🚧 Channel lanes in a conversation copy's channel list (the dossier's
 * `composer.channels`, narrowed per copy by the host).
 *
 * An entry is either a **bare slug** (`parley`: the whole channel, every lane
 * of it — as the server's reads take it) or an **explicit lane**
 * (`parley:2`, and `parley:1` for lane 1: that lane alone). A copy whose
 * `channelLane` setting names a lane — `mine`, resolved by the host from
 * `SessionV1.channels[].mine`, or a number — is told the explicit form; a
 * viewer with no lane yet on the claimed personal channel is told
 * `NO_LANE_CHANNEL` alone, and the copy shows nothing.
 *
 * A display claim: privacy is the server's — a channel declared
 * `lanes: 'personal'` has each lane sent to its person and the session's
 * owner alone (owner ruling 2026-10-17), so a copy narrows rows the viewer
 * may already read.
 */
import { formatChannel, parseChannel } from '@serene-pub/sdk'

/**
 * Stands in a copy's channel list for "the viewer is in no lane of the
 * channel this copy claims". Never a channel: no row is on it, and no line is
 * written to it.
 * @experimental
 */
export const NO_LANE_CHANNEL = '\u0000no-lane'

/** Whether a listed channel is `NO_LANE_CHANNEL`. @experimental */
export function isNoLaneChannel(listed: unknown): boolean {
	return listed === NO_LANE_CHANNEL
}

/**
 * Whether a row on `rowChannel` (absent: `main`) is shown by a copy listing
 * `listed`: an explicit lane matches that lane by canonical form (`parley:1`
 * holds the rows stored `parley`), a bare slug every lane of its channel, and
 * `NO_LANE_CHANNEL` nothing.
 * @experimental
 */
export function rowOnListedChannels(listed: readonly string[], rowChannel: unknown): boolean {
	const row = parseChannel(typeof rowChannel === 'string' && rowChannel ? rowChannel : 'main')
	for (const entry of listed) {
		if (isNoLaneChannel(entry)) continue
		const ref = parseChannel(entry)
		if (ref.slug !== row.slug) continue
		if (!ref.explicit || ref.lane === row.lane) return true
	}
	return false
}

/**
 * The canonical form of a listed channel, as a line is written and a row is
 * stored (`parley:1` → `parley`); `NO_LANE_CHANNEL` stays itself.
 * @experimental
 */
export function canonicalListedChannel(listed: string): string {
	return isNoLaneChannel(listed) ? listed : formatChannel(parseChannel(listed))
}
