import { clampToBounds, formatSlotValue } from './barMath.js';
/** A settings list of names (`pickSlots`, `pickMembers`): trimmed, lower-cased, blanks dropped. @experimental */
export function pickedNames(raw) {
    return Array.isArray(raw) ? raw.map((n) => String(n).trim().toLowerCase()).filter(Boolean) : [];
}
/** The owner's values: the world's bag, a cast member's or a location's by owner key. */
function bagOf(state, owner) {
    if (owner.kind === 'session')
        return state.resolved.world ?? {};
    if (owner.kind === 'session_location')
        return state.resolved.locations?.[owner.key] ?? {};
    return state.resolved.cast?.[owner.key] ?? {};
}
/** The slots an owner may carry, in declaration order. @experimental */
export function slotsFor(state, owner) {
    return state.slots.filter((s) => Object.hasOwn(owner.configs ?? {}, s.slotId));
}
/** One owner's value for one slot, by the slot's qualified key. @experimental */
export function valueOf(state, owner, slot) {
    return bagOf(state, owner)[slot.qualifiedKey];
}
/** Does this owner have any value at all — is it in play? @experimental */
export function hasAnyValue(state, owner) {
    return slotsFor(state, owner).some((s) => valueOf(state, owner, s) !== undefined);
}
/** Is the slot one a `pick` names, by key or label? `all` takes every slot. */
function slotPicked(slot, mode, picked) {
    return mode !== 'pick' || picked.includes(slot.key) || picked.includes(slot.label.toLowerCase());
}
function shown(state, owner, mode, picked) {
    return slotsFor(state, owner)
        .filter((slot) => slotPicked(slot, mode, picked))
        .map((slot) => ({ slot, config: owner.configs[slot.slotId] ?? {}, value: valueOf(state, owner, slot) }));
}
const pickEnum = (raw, of, fallback) => typeof raw === 'string' && of.includes(raw) ? raw : fallback;
/** @experimental */
export function worldStateView(state, settings, 
/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
granted) {
    const layout = pickEnum(settings.layout, ['strip', 'list'], 'strip');
    if (granted === false)
        return { status: 'not-granted', layout };
    if (state && !state.loaded && state.error)
        return { status: 'failed', layout };
    if (!state || !state.loaded)
        return { status: 'loading', layout };
    const mode = pickEnum(settings.slots, ['all', 'pick'], 'all');
    const picked = pickedNames(settings.pickSlots);
    const world = state.owners.find((o) => o.kind === 'session' && o.key === 'world') ?? null;
    const slots = world ? shown(state, world, mode, picked) : [];
    const places = state.owners
        .filter((o) => o.kind === 'session_location')
        .map((owner) => ({ owner, slots: shown(state, owner, mode, picked).filter((s) => s.value !== undefined) }))
        .filter((place) => place.slots.length);
    if (!world || (!slots.length && !places.length))
        return { status: 'empty', layout, reason: state.slots.length ? 'none-shown' : 'none-declared' };
    return { status: 'shown', layout, owner: world, slots, places };
}
/** @experimental */
export function statsView(state, settings, 
/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
granted) {
    const density = pickEnum(settings.density, ['compact', 'full'], 'full');
    if (granted === false)
        return { status: 'not-granted', density };
    if (state && !state.loaded && state.error)
        return { status: 'failed', density };
    if (!state || !state.loaded)
        return { status: 'loading', density };
    if (!state.slots.length)
        return { status: 'none-declared', density };
    const membersMode = pickEnum(settings.members, ['scene', 'all', 'pick'], 'scene');
    const slotsMode = pickEnum(settings.slots, ['all', 'pick'], 'all');
    const pickedMembers = pickedNames(settings.pickMembers);
    const pickedSlots = pickedNames(settings.pickSlots);
    const members = state.owners
        // The cast's alone: a location (phase 4) is drawn by World State.
        .filter((o) => o.kind === 'session_cast')
        .filter((owner) => {
        if (membersMode === 'all')
            return true;
        if (membersMode === 'pick')
            return pickedMembers.includes(owner.label.toLowerCase()) || pickedMembers.includes(owner.key);
        // Scene: whoever has state in play. A member nobody has given a value
        // to has nothing to show, and an empty card is not a stat.
        return hasAnyValue(state, owner);
    })
        .map((owner) => ({ owner, slots: shown(state, owner, slotsMode, pickedSlots) }));
    if (!members.length)
        return { status: 'no-members', density, members: membersMode };
    return { status: 'shown', density, members };
}
// ─── Editing one slot ───────────────────────────────────────────────────────
/**
 * Can a person write this slot? A derived slot is computed on every read and
 * has nothing to write; a retired one still resolves and takes nothing new.
 * @experimental
 */
export const slotWritable = (slot) => slot.type !== 'derived' && !slot.retired;
/**
 * An integer field's draft as a write: empty clears (`null`), a number is
 * truncated and held inside the bounds in force, anything else writes
 * nothing (`undefined`). A number field's bound value is a number, or null
 * when empty.
 * @experimental
 */
export function numberDraftValue(draft, config) {
    if (draft === null || draft === undefined || (typeof draft === 'string' && draft.trim() === ''))
        return null;
    const n = Number(draft);
    if (!Number.isFinite(n))
        return undefined;
    return clampToBounds(Math.trunc(n), config);
}
/**
 * A text field's draft as a write: blank clears (`null`); otherwise the text,
 * cut to the configuration's `maxLength` — the field cannot carry the limit
 * itself (a remote's `input` takes no `maxlength`).
 * @experimental
 */
export function textDraftValue(draft, config) {
    const text = draft == null ? '' : String(draft);
    if (text.trim() === '')
        return null;
    const max = config.maxLength;
    return typeof max === 'number' && Number.isInteger(max) && max >= 0 ? text.slice(0, max) : text;
}
/** An enum slot's **enum values** — the bare stored values its configuration closes (not `EnumOption`s). @experimental */
export function enumValues(config) {
    return Array.isArray(config.of) ? config.of.map(String) : [];
}
/**
 * A value as a person reads it, in the widget's language: the words
 * (`cleared`, `on`, `off`) through `t`, a number or a text as itself.
 * @experimental
 */
export function slotValueText(value, t) {
    const text = formatSlotValue(value);
    return value === null || typeof value === 'boolean' ? t(text) : text;
}
//# sourceMappingURL=stateView.js.map