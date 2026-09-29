/**
 * A number, whole unless a slot says otherwise. With a floor and a ceiling in
 * force it is drawn as a bar; with either missing it is a number, because a
 * half-full bar over half a range invents the half.
 * @experimental
 */
export declare const numberStatShape: import("@serene-pub/sdk").StatShapeDecl;
/**
 * One of a closed set — a mood, the weather, whether the case is open. The
 * options are the slot's (`config.of`): a choice with none is refused where
 * it is declared.
 * @experimental
 */
export declare const choiceStatShape: import("@serene-pub/sdk").StatShapeDecl;
/**
 * An ordered list of text or lore references — an inventory, the companions
 * travelling along, the clues found. Items are added, removed and reordered;
 * a lore reference names an entry (`{ entryId }`) and reads as its title.
 * @experimental
 */
export declare const listStatShape: import("@serene-pub/sdk").StatShapeDecl;
/**
 * A position on the story calendar — a date, optionally with a time of day
 * (`412-03-05 22:30`), shown through the calendar (`formatStoryTime`). A
 * clock is this shape: the time a scene has reached.
 * @experimental
 */
export declare const storyTimeStatShape: import("@serene-pub/sdk").StatShapeDecl;
/** The catalogue, in the order a picker offers it. @experimental */
export declare const CORE_STAT_SHAPES: readonly [import("@serene-pub/sdk").StatShapeDecl, import("@serene-pub/sdk").StatShapeDecl, import("@serene-pub/sdk").StatShapeDecl, import("@serene-pub/sdk").StatShapeDecl];
//# sourceMappingURL=statShapes.d.ts.map