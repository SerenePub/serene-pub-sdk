import { barView } from '../session-state/barMath.js';
import { slotKind } from '../session-state/shapes.js';
/** The declared defaults (`CORE_WIDGETS`, the `scene-portraits` entry). @experimental */
export const SCENE_PORTRAITS_DEFAULTS = Object.freeze({
    source: 'pinned',
    persona: false,
    bars: false,
    sprites: true,
});
/** Read one settings payload into the complete object above. @experimental */
export function readScenePortraitsSettings(raw) {
    const v = raw ?? {};
    const d = SCENE_PORTRAITS_DEFAULTS;
    return {
        source: v.source === 'scene' || v.source === 'pinned' ? v.source : d.source,
        persona: typeof v.persona === 'boolean' ? v.persona : d.persona,
        bars: typeof v.bars === 'boolean' ? v.bars : d.bars,
        sprites: typeof v.sprites === 'boolean' ? v.sprites : d.sprites,
    };
}
/**
 * The state owner a cast member's values are filed under, by character id —
 * the cast owner whose id is the character's. Null when the session has no
 * state for it.
 * @experimental
 */
export function stateOwnerKeyOf(state, characterId) {
    return state?.owners.find((o) => o.kind === 'session_cast' && o.id === characterId)?.key ?? null;
}
/**
 * The scene source's faces: every character still in the session, then —
 * when `settings.persona` asks — the persona the VIEWER is voicing (`mine`,
 * R77), never merely the first one listed. A persona carries no state of its
 * own and shows its avatar: it draws a face and no bars, and no menu.
 * @experimental
 */
export function scenePortraitsOf(characters, state, settings) {
    const members = characters?.members ?? [];
    const out = [];
    for (const m of members) {
        if (m.isPersona)
            continue;
        out.push({
            key: m.ref,
            characterId: m.characterId,
            isPersona: false,
            name: m.name,
            src: settings.sprites ? (m.sprite ?? m.face) : m.face,
            ownerKey: stateOwnerKeyOf(state, m.characterId),
            spriteSets: m.spriteSets,
            spriteSetOverride: m.spriteSetOverride ?? null,
            offersSpriteSets: settings.sprites && m.canChangeSpriteSet && m.spriteSets.length > 1,
        });
    }
    if (!settings.persona)
        return out;
    const mine = members.find((m) => m.isPersona && m.mine);
    if (mine)
        out.push({
            key: mine.ref,
            characterId: mine.characterId,
            isPersona: true,
            name: mine.name,
            src: mine.face,
            ownerKey: null,
            spriteSets: [],
            spriteSetOverride: null,
            offersSpriteSets: false,
        });
    return out;
}
const characterIdOf = (ref) => {
    const m = /^character:(\d+)$/.exec(ref ?? '');
    return m ? Number(m[1]) : null;
};
/** The two pinned sides, left then right. @experimental */
export function pinnedPortraitsOf(characters, state) {
    return ['left', 'right'].map((side) => {
        const pin = characters?.sceneImages[side] ?? null;
        const id = characterIdOf(pin?.ref);
        return { side, src: pin?.src ?? null, ownerKey: id == null ? null : stateOwnerKeyOf(state, id) };
    });
}
/**
 * One owner's mini bar row: its bounded stats, in declaration order, at most
 * `limit` of them. Only a number stat (`slotKind`) whose configuration in
 * force declares both ends of a range is a bar (`barView`); every other
 * shape — a choice, a list, a story time — is left out, because
 * this row has no room to say what it is.
 * @experimental
 */
export function statBarsOf(state, ownerKey, limit = 3) {
    if (!state)
        return [];
    const owner = state.owners.find((o) => o.key === ownerKey);
    if (!owner)
        return [];
    const bag = ownerKey === 'world' ? state.resolved.world : (state.resolved.cast[ownerKey] ?? {});
    const out = [];
    for (const slot of state.slots) {
        if (!Object.hasOwn(owner.configs, slot.slotId))
            continue;
        // Only a number stat is a bar: a list's count bounds or a choice
        // carrying numbers is not a range with a fill.
        if (slotKind(slot) !== 'number')
            continue;
        const bar = barView(bag[slot.qualifiedKey], owner.configs[slot.slotId]);
        if (bar)
            out.push({ slotId: slot.slotId, label: slot.label, bar });
        if (out.length >= limit)
            break;
    }
    return out;
}
//# sourceMappingURL=portraits.js.map