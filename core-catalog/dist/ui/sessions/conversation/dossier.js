/**
 * 🚧 The conversation **dossier**: what core's conversation widget is told
 * about its session, beyond the
 * envelope's base sections (C0b) — the `session_full.v1` its host projects,
 * core's own widget being granted `session:full`.
 *
 * The page answers here what only the page can: who the viewer controls, who
 * spoke each line and with what face, where scenes and history entries fall,
 * whether older messages remain. The widget judges nothing it is not told,
 * and acts only through its verbs (`invoke`, `request`) — so the same widget
 * runs as a remote in the page's UI worker, where there is no page to ask.
 *
 * A plugin's widget sees it only when it declares the `session:full` scope
 * and an admin grants that permission (`widget:session:full`) at review —
 * never by default; the grant shows the whole conversation as the viewer
 * sees it (the cast, their personas, their unsent draft, the session's
 * state). Provisional: its shape settles with the C7 cutover.
 */
import { UNCLAIMED_LINE_NAME } from '@serene-pub/sdk';
/**
 * What a line reads as when the dossier names it not. Named, never "Unknown"
 * (ruled 2026-09-26): the SDK's generic name for a line nobody claims.
 * @experimental
 */
export const NO_LINE = {
    controllable: false,
    speaker: { name: UNCLAIMED_LINE_NAME.en, ref: null, face: null, sprite: null },
    swipes: { show: false, right: false },
    embedding: 'hidden',
};
//# sourceMappingURL=dossier.js.map