/** The half of a slot's configuration a bar reads. @experimental */
export interface BarBounds {
    min?: number;
    max?: number;
    [key: string]: unknown;
}
/** @experimental */
export interface BarView {
    min: number;
    max: number;
    /** The stored value, unclamped. */
    value: number;
    /** Where the fill ends, 0 to 100. */
    percent: number;
    /** `14/20` — the value as written, over the ceiling in force. */
    label: string;
}
/** The bar this value and configuration describe, or `null` when they do not. @experimental */
export declare function barView(value: unknown, config: BarBounds): BarView | null;
/** Hold a number inside whichever bounds the configuration declares. @experimental */
export declare function clampToBounds(value: number, config: BarBounds): number;
/**
 * A stored value as a person reads it.
 *
 * `null` is a layer saying "cleared, read the one below", which is a different
 * sentence from a missing answer — so it is said in words rather than drawn as
 * a blank, and absence is the blank.
 * @experimental
 */
export declare function formatSlotValue(value: unknown): string;
//# sourceMappingURL=barMath.d.ts.map