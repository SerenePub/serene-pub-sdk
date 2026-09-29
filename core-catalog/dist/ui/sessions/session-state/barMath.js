/**
 * Drawing a stat: when a number is a bar, and what one says. Moved from the
 * app (R21): core's state widgets draw with it, and the app re-exports it.
 *
 * A bar is a claim about a range, so it is drawn only when the configuration in
 * force declares both ends of one. An integer with a floor and no ceiling is a
 * number, and drawing it as a half-full bar would invent the half.
 *
 * ⚠ Only the DRAWING is clamped. A value outside its bounds is a real value —
 * a cap that dropped after the write, a script that overshot — and the label
 * keeps saying what it is, because a bar that reads `20/20` for a stored 35 is
 * the surface lying about the row underneath it.
 */
import { isSlotLoreRef, slotListItemText } from '@serene-pub/sdk';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
/** The bar this value and configuration describe, or `null` when they do not. @experimental */
export function barView(value, config) {
    const { min, max } = config;
    if (!finite(value) || !finite(min) || !finite(max))
        return null;
    if (max <= min)
        return null;
    const span = max - min;
    const percent = Math.min(100, Math.max(0, ((value - min) / span) * 100));
    return { min, max, value, percent, label: `${value}/${max}` };
}
/** Hold a number inside whichever bounds the configuration declares. @experimental */
export function clampToBounds(value, config) {
    let out = value;
    if (finite(config.min))
        out = Math.max(config.min, out);
    if (finite(config.max))
        out = Math.min(config.max, out);
    return out;
}
/**
 * A stored value as a person reads it.
 *
 * `null` is a layer saying "cleared, read the one below", which is a different
 * sentence from a missing answer — so it is said in words rather than drawn as
 * a blank, and absence is the blank.
 * @experimental
 */
export function formatSlotValue(value) {
    if (value === null)
        return 'cleared';
    if (value === undefined)
        return '';
    if (typeof value === 'boolean')
        return value ? 'on' : 'off';
    // A list reads as its items; a lore reference by the title a read filled
    // in, or by its entry when nothing did (a ledger row is the stored value).
    // With its held count when it holds more than one: `Rusty key ×2`.
    if (Array.isArray(value))
        return value.map((item) => slotListItemText(item)).join(', ');
    // 🚧 One reference on its own — a location that is a place entry.
    if (isSlotLoreRef(value))
        return slotListItemText(value);
    return String(value);
}
//# sourceMappingURL=barMath.js.map