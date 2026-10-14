/**
 * 🚧 The conversation **dossier**: what core's conversation widget is told
 * about its session beyond the envelope's base sections (C0b) — the
 * `session_full.v1` its host projects, core's own widget being granted
 * `session:full`.
 *
 * Declared in the SDK since 2026-10-10 (`SessionDossierV1`,
 * `@serene-pub/sdk` `sessionDossier.ts`, PLAN-widget-system-consolidation
 * C4), beside the other section shapes, so the envelope's `session_full`
 * section names its shape instead of `unknown`. Re-exported here under the
 * names this subpath has always carried; `ConversationDossierV1` is the
 * SDK's `SessionDossierV1` under its old name (⏳ REMOVE in 0.7.0).
 *
 * A plugin's widget sees it only when it declares the `session:full` scope
 * and an admin grants that permission (`widget:session:full`) at review —
 * never by default. Provisional: its shape settles when the conversation
 * moves onto the public contract (C8).
 */

import { UNCLAIMED_LINE_NAME, type ConversationLineV1, type SessionDossierV1 } from '@serene-pub/sdk'

export type {
	AttachmentKindV1,
	AttachmentReadersV1,
	ConversationCastV1,
	ConversationComposerV1,
	ConversationLineV1,
	ConversationProposalV1,
	ConversationSceneCastV1,
	ConversationSceneV1,
	ConversationSpeakerV1,
	ConversationStateV1,
	ConversationTabV1,
	SessionDossierV1,
	TrayItemV1,
} from '@serene-pub/sdk'

/**
 * ⏳ The dossier under its pre-C4 name — the SDK's `SessionDossierV1`, the
 * same type. REMOVE in 0.7.0: name `SessionDossierV1`.
 * @experimental
 */
export type ConversationDossierV1 = SessionDossierV1

/**
 * What a line reads as when the dossier names it not. Named, never "Unknown"
 * (ruled 2026-09-26): the SDK's generic name for a line nobody claims.
 * @experimental
 */
export const NO_LINE: ConversationLineV1 = {
	controllable: false,
	speaker: { name: UNCLAIMED_LINE_NAME.en, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden',
}
