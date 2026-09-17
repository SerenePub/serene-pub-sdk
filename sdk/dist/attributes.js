/**
 * Attribute slots — the declared vocabulary behind stats and states.
 *
 * ## Three levels, and only the middle one is new here
 *
 * A stat is three things, not one (entries plan Part 3): a **declaration**
 * ("Health is an integer with a max, and it attaches to cast members"), a
 * **configuration** ("this character's Health caps at 20"), and a **value**
 * ("health = 12, as of message 47"). This file owns the first. The other two
 * are rows in the host's `attribute_configs` and `attribute_values`, keyed by
 * the id declared here.
 *
 * ## Core owns the types; nobody owns them but core
 *
 * `SlotType` is a **closed set of five**, and it is closed because each member
 * is logic core implements: a bounded integer is a bar, an enum is a chip, a
 * derived slot is never written at all. Genres, plugins and admins compose
 * *definitions* from those types — `hp`, `gold`, `weather`, `mood` — the same
 * way a genre composes a session shape from declared fields. A composed
 * definition cannot introduce behaviour core does not already understand,
 * which is why authorship can be open here where it is not for the types.
 *
 * ## No projection table, deliberately
 *
 * Node types project into `pipeline_definition_registry` rows because a *spec* has to
 * be able to reference one that this build does not declare. A slot has no such
 * consumer: every read of one goes through this registry in-process, and every
 * write is validated against it at write time. Adding a `slot_definitions`
 * table would create a second answer to "what is Health" that nothing
 * reconciles. A card or lorebook naming a slot this install lacks keeps its
 * values as opaque data — shown, not validated — which is the standing
 * "never refuse, fall back and say so" rule for a stale binding.
 *
 * ## The catch: two kinds of prose
 *
 * `label` and `description` are what a person reads, so they are stripped from
 * the content hash and copyediting one is free. **`descriptor` is what the
 * model reads**, so editing it changes every prompt the slot appears in — it is
 * contract, it is inside the hash, and changing it means `@N+1`. Conflating
 * the two would ship prompt-changing edits silently.
 *
 * ⚠ **"Slot" here is not a pipeline slot.** NOMENCLATURE §"slot" is a declared
 * parameter address on a node type (`SlotDecl` in descriptors.ts). This is an
 * *attribute* slot, and prose says the qualified word. The two never meet: one
 * is a key on a descriptor, the other is an id in this registry.
 *
 * The exported API says the qualified word too — `defineAttributeSlot`,
 * `getAttributeSlot`, `attributeSlots` — because the unqualified names sat one
 * import line away from the pipeline `slot()` address helper, and a name that
 * reads correctly only if you know which module it came from is a name that
 * will be imported wrong. The *types* keep the short names (`SlotId`,
 * `SlotConfig`, `SlotValue`): they are only ever written next to this file's
 * functions, so they cannot be mistaken at a call site.
 */
import { refuseUnlessIdentical } from './hash.js';
const SLOT_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:slot\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/;
export function assertSlotId(id) {
    if (!SLOT_ID.test(id))
        throw new Error(`'${id}' is not a valid attribute slot id. Use 'owner:slot/name@N' — ` +
            `'core:slot/hp@1', 'acme.rp:slot/tension@1'. The id is what a stored value ` +
            `is filed under for the life of the card that carries it; the display name ` +
            `lives in the declaration.`);
}
export const derivations = Object.freeze({
    /**
     * How old someone is: a `birthdate` value on the same owner, against the
     * session's story date. Absent — not zero — when either is missing, which
     * is the whole reason age is derived and not typed in.
     */
    age: Object.freeze({
        id: 'core:derive/age@1',
        requiresFrom: true,
        description: "A birthdate slot on the same owner, read against the session's story date.",
    }),
});
export const getDerivation = (id) => Object.values(derivations).find((d) => d.id === id);
const registry = new Map();
/**
 * Display text this registry carries outside `i18n`/`description`.
 *
 * `label` only. `descriptor` is deliberately absent — see the file header: it
 * is model-facing prose and therefore content.
 */
export const SLOT_DISPLAY_KEYS = { display: ['label'] };
/**
 * Declare an attribute slot.
 *
 * The same two refusals every registry here makes: an id has exactly one owner,
 * and an identical re-declaration is a no-op (a dev-server reload re-running a
 * module must not throw). A *different* declaration under a claimed id throws
 * with both hashes named.
 */
export function defineAttributeSlot(id, props) {
    assertSlotId(id);
    checkSlotDeclaration(id, props);
    const decl = Object.freeze({ ...props, id });
    const existing = registry.get(id);
    if (existing)
        refuseUnlessIdentical(existing, decl, `duplicate attribute slot id: ${id}`, SLOT_DISPLAY_KEYS);
    registry.set(id, decl);
    return decl;
}
/**
 * The plugin-facing door — same registration, minus the ability to claim core's
 * namespace. A plugin that could redefine `core:slot/hp@1` would change what
 * every character's health means on the instance without appearing anywhere.
 */
export function definePluginAttributeSlot(pluginId, id, props) {
    if (id.startsWith('core:'))
        throw new Error(`plugin '${pluginId}' may not declare '${id}': the 'core:' namespace is reserved. ` +
            `Publish it under your own namespace — a slot two parties can define is one ` +
            `where a stored value means different things depending on load order.`);
    return defineAttributeSlot(id, props);
}
export const getAttributeSlot = (id) => registry.get(id);
export const attributeSlots = () => [...registry.values()];
export function _clearAttributeSlots() {
    registry.clear();
}
/** What a declaration must satisfy before it is worth storing values against. */
function checkSlotDeclaration(id, props) {
    if (!props.descriptor?.trim())
        throw new Error(`${id} declares no descriptor. It is the sentence the model reads about this ` +
            `slot; a slot without one reaches a prompt as a bare number.`);
    if (!props.appliesTo?.length)
        throw new Error(`${id} declares no appliesTo. Say whether it attaches to 'cast', to 'world', or ` +
            `to both — a slot nothing may carry can never hold a value.`);
    if (props.type === 'enum' && !props.config?.of?.length)
        throw new Error(`${id} is an enum with no options. Declare config.of — the closed set is what ` +
            `makes it a chip rather than a text field.`);
    if (props.type === 'derived') {
        const derivation = props.config?.derivation;
        const decl = derivation ? getDerivation(derivation) : undefined;
        if (!decl)
            throw new Error(`${id} is derived but names ${derivation ? `'${derivation}'` : 'no derivation'}, ` +
                `which is not one of core's: ${Object.values(derivations)
                    .map((d) => d.id)
                    .join(', ')}. Derivations are core-owned logic, not composable.`);
        if (decl.requiresFrom && !props.config?.from)
            throw new Error(`${id} names ${decl.id}, which reads another slot — declare config.from with ` +
                `that slot's id. ${decl.description}`);
    }
    if (props.default !== undefined && props.type === 'derived')
        throw new Error(`${id} is derived and declares a default. A derived slot is computed or absent; a ` +
            `default would be a stored answer to a question whose whole point is that it ` +
            `must not be stored.`);
}
// ── Validation, at the write ────────────────────────────────────────────────
/**
 * The configuration in force for one owner: the declaration's own config with
 * each layer's deviations laid over it, nearest layer last.
 *
 * Merging keys rather than replacing objects is what makes "deviations only"
 * real — a session that raised a cap must not silently drop the enum options
 * the lorebook declared beside it.
 */
export function resolveSlotConfig(decl, ...layers) {
    return layers.reduce((acc, layer) => (layer ? { ...acc, ...layer } : acc), { ...(decl.config ?? {}) });
}
/**
 * Why this value may not be stored under this slot, or `null` if it may.
 *
 * A sentence rather than a boolean, because every caller — a socket handler, a
 * node, a review gate — has to tell a person what was wrong, and three callers
 * inventing three wordings for one rule is how a validator stops being one.
 *
 * ⚠ A value is checked against the configuration valid at **its own anchor**,
 * not against the current one (plan Part 3). Callers pass that config in; this
 * function never reaches for a current one, because doing so is precisely the
 * mistake that retroactively invalidates a legitimate historical value.
 */
export function checkSlotValue(decl, value, config = decl.config ?? {}) {
    if (decl.type === 'derived')
        return `${decl.id} is derived, so it has no value to set — it is computed from ${config.from ?? 'another slot'} every time it is read.`;
    // Clearing is always legal: it is how a layer says "inherit again", and a
    // cleared value must not have to satisfy a bound it is opting out of.
    if (value === null)
        return null;
    switch (decl.type) {
        case 'integer': {
            if (typeof value !== 'number' || !Number.isInteger(value))
                return `${decl.id} is a whole number; '${String(value)}' is not one.`;
            if (typeof config.min === 'number' && value < config.min)
                return `${decl.id} does not go below ${config.min}.`;
            if (typeof config.max === 'number' && value > config.max)
                return `${decl.id} does not go above ${config.max}.`;
            return null;
        }
        case 'enum': {
            const of = config.of ?? [];
            if (typeof value !== 'string' || !of.includes(value))
                return `${decl.id} is one of ${of.join(', ') || '(nothing declared)'}; '${String(value)}' is not.`;
            return null;
        }
        case 'text': {
            if (typeof value !== 'string')
                return `${decl.id} is text.`;
            if (typeof config.maxLength === 'number' && value.length > config.maxLength)
                return `${decl.id} is at most ${config.maxLength} characters.`;
            return null;
        }
        case 'boolean':
            return typeof value === 'boolean' ? null : `${decl.id} is on or off.`;
    }
}
/**
 * Whether a slot may attach to this kind of owner.
 *
 * The owner *kinds* the host stores (`card`, `cast_member`, `lorebook`,
 * `session`, `session_cast`) collapse to the two a declaration talks about: a
 * lorebook and a session are the **world**, everything that is somebody is the
 * **cast**. A declaration should not have to know the host's storage layout to
 * say "this is a character stat".
 */
export const slotAppliesTo = (decl, owner) => decl.appliesTo.includes(owner);
//# sourceMappingURL=attributes.js.map