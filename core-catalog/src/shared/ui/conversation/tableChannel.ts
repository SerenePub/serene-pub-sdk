/**
 * 🚧 The **table channel** (PLAN-rulesets §30, ruled 2026-10-16): where a
 * genre's rolls, checks and calculations are written — never the story's
 * history, where the Narrator read them and imitated them. A folio with no
 * voice and no speaker (not the Narrator, not an envoy); each row is anchored
 * to the message it belongs to (`metadata.anchorMessageId`), so it reads "at
 * that moment" and retracts with it. A genre that wants it declares
 * {@link TABLE_CHANNEL_DECL} in its `SessionShape.channels`; the messages
 * widget draws its rows inline under their anchors (`interleave`), or a copy
 * pinned to it shows them as a log (_Dice_).
 */
import type { ChannelDecl } from '@serene-pub/sdk'

/** The table channel's slug. 🚧 @experimental */
export const TABLE_CHANNEL = 'table'

/** The table channel's declaration, as a genre lists it. 🚧 @experimental */
export const TABLE_CHANNEL_DECL = Object.freeze({
	slug: TABLE_CHANNEL,
	label: { en: 'Dice' },
	role: 'folio',
	voice: 'none',
} as const) satisfies ChannelDecl
