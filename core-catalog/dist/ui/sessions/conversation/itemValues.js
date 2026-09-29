/**
 * The message venue's per-row published values — `item.<field>` (plans/29
 * R-15 *enabled-when*; plans/30 U5e, 2026-09-17).
 *
 * One pure shape both sides build: the server at the door from the real row
 * (`entities/publishedValues.ts`), the client per rendered row from what it
 * already knows (`messageVerbState.ts`). A field added here is added for
 * both, which is what lets a listing hand the client the `item.*` predicates
 * it could not evaluate without a message and trust the answer to match the
 * door's.
 */
import { envoySlugOfRef } from '@serene-pub/sdk';
/**
 * Who spoke a row, as a participant reference — see `ItemValues.speaker`.
 * An envoy's reference wins (an envoy has no character row to name), then
 * the persona a person wrote as, then the speaking character.
 * @experimental
 */
export function itemSpeakerOf(row) {
    const envoy = envoySlugOfRef(row.metadata?.speaker);
    if (envoy)
        return `envoy:${envoy}`;
    if (row.personaId != null)
        return `character:${row.personaId}`;
    if (row.characterId != null)
        return `character:${row.characterId}`;
    return null;
}
/** The `item` document for one message — pure, the same on both sides. @experimental */
export function itemValuesOf(row, facts) {
    const greeting = row.metadata?.isGreeting === true;
    const swipes = row.metadata?.swipes;
    const idx = swipes?.currentIdx;
    const len = swipes?.history?.length ?? 0;
    const hasNext = typeof idx === 'number' && idx < len - 1;
    const role = row.role ?? '';
    const speaker = itemSpeakerOf(row);
    return {
        id: row.id,
        isNewest: facts.isNewest,
        hidden: row.isHidden === true,
        generating: row.isGenerating === true,
        role,
        mine: facts.mine,
        hasSwipes: greeting ? hasNext : true,
        greeting,
        channel: row.channel || 'main',
        speaker,
        characterLine: role !== 'user' && !!speaker?.startsWith('character:'),
    };
}
//# sourceMappingURL=itemValues.js.map