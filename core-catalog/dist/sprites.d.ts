/** @internal */
export declare const SPRITES_VERSION = "1.0.0";
/** A person's pick from the message menu, run as an action (§6). @experimental */
export declare const SHOW_SPRITE_SPEC_ID = "core:spec/show-sprite";
/** The picker's node key inside the tail — the address a rebind names. @internal */
export declare const SPRITE_PICKER_NODE_KEY = "spriteTail.show.spritePick";
/** Core's pickers. One today; a plugin's pure task publishing `sprite-pick@1` joins it. @internal */
export declare const SPRITE_PICKER_IDS: readonly ['core:task/pick-sprite-similarity@1'];
/**
 * Append the sprite tail to a reply spec's builder. The builder must already
 * hold an inlet keyed `input` publishing `sessionScope` and an outlet keyed
 * `save` publishing `messageId` — every reply spec in the catalog does.
 * @experimental
 */
export declare function withSpriteTail<B>(builder: B): B;
/**
 * A person's pick (§6): the message menu's **Change sprite**, run as an
 * action so the write is receipted and emits `sprite-shown` like any other.
 * The host records `source: 'person'` for THIS spec and no other, and checks
 * the person may act on the line (the `item` rule), as it does for an edit.
 * @experimental
 */
export declare const showSpriteSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=sprites.d.ts.map