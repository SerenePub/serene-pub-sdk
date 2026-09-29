/**
 * The Scene Portraits widget's reading of its sections (R21, R76, R77): which
 * faces it draws, from which image, with which bars — worked out here, in
 * plain TypeScript, so the component only draws what these return.
 *
 * Everything is read off what the host already resolved: `characters.v1`
 * (the cast, cast over card, every URL and current sprite resolved, the
 * page's pins riding along) and `session_state.v1` (the bars). The widget
 * never reads the log (its declared reads are `settings` alone).
 */
import type { SessionCharacterV1, SessionCharactersV1, SessionStateV1 } from '@serene-pub/sdk';
import { type BarView } from '../session-state/barMath.js';
/** Where the faces come from: the two pins, or the cast itself. @experimental */
export type ScenePortraitsSource = 'pinned' | 'scene';
/** The widget's settings, complete: the declared defaults where the instance has none. @experimental */
export interface ScenePortraitsSettings {
    source: ScenePortraitsSource;
    /** Put the viewer's own persona beside the cast (scene only). */
    persona: boolean;
    /** A mini bar row under each face. */
    bars: boolean;
    /** Each member's current sprite over its avatar (scene only). */
    sprites: boolean;
}
/** The declared defaults (`CORE_WIDGETS`, the `scene-portraits` entry). @experimental */
export declare const SCENE_PORTRAITS_DEFAULTS: ScenePortraitsSettings;
/** Read one settings payload into the complete object above. @experimental */
export declare function readScenePortraitsSettings(raw: Record<string, unknown> | undefined): ScenePortraitsSettings;
/** One face the scene source draws. @experimental */
export interface ScenePortrait {
    /** `character:<id>` — a persona's too. */
    key: SessionCharacterV1['ref'];
    characterId: number;
    isPersona: boolean;
    name: string;
    /** The image to draw; null draws the blank face. */
    src: string | null;
    /** The state owner this member's values are filed under; null when it has none (a persona). */
    ownerKey: string | null;
    /** The card's sprite sets — offered only when `canChangeSpriteSet`. */
    spriteSets: string[];
    /** The session's own pick; null when the story decides. */
    spriteSetOverride: string | null;
    /**
     * The sprite-set menu is offered: the viewer may switch it (R77, the
     * server's rule), sprites are shown, and there is more than one set.
     */
    offersSpriteSets: boolean;
}
/**
 * The state owner a cast member's values are filed under, by character id —
 * the cast owner whose id is the character's. Null when the session has no
 * state for it.
 * @experimental
 */
export declare function stateOwnerKeyOf(state: SessionStateV1 | undefined, characterId: number): string | null;
/**
 * The scene source's faces: every character still in the session, then —
 * when `settings.persona` asks — the persona the VIEWER is voicing (`mine`,
 * R77), never merely the first one listed. A persona carries no state of its
 * own and shows its avatar: it draws a face and no bars, and no menu.
 * @experimental
 */
export declare function scenePortraitsOf(characters: SessionCharactersV1 | undefined, state: SessionStateV1 | undefined, settings: ScenePortraitsSettings): ScenePortrait[];
/** One side of the pinned source. @experimental */
export interface PinnedPortrait {
    side: 'left' | 'right';
    /** The pinned image; null for an empty side. */
    src: string | null;
    /**
     * The state owner of the member it pictures, when the host could tell who
     * that is (`SessionSceneImageV1.ref`); an image pinned from anywhere else
     * pictures nobody, and gets no bars — the only honest answer to "whose
     * stats are these".
     */
    ownerKey: string | null;
}
/** The two pinned sides, left then right. @experimental */
export declare function pinnedPortraitsOf(characters: SessionCharactersV1 | undefined, state: SessionStateV1 | undefined): PinnedPortrait[];
/** One bar of a mini bar row. @experimental */
export interface StatBarRow {
    slotId: string;
    label: string;
    bar: BarView;
}
/**
 * One owner's mini bar row: its bounded stats, in declaration order, at most
 * `limit` of them. Only a number stat (`slotKind`) whose configuration in
 * force declares both ends of a range is a bar (`barView`); every other
 * shape — a choice, a list, a story time — is left out, because
 * this row has no room to say what it is.
 * @experimental
 */
export declare function statBarsOf(state: SessionStateV1 | undefined, ownerKey: string, limit?: number): StatBarRow[];
//# sourceMappingURL=portraits.d.ts.map