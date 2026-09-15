/**
 * Descriptors — the shared-scope declaration of a type (01 §1, 04 §3).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the hook that implements it. That is what lets the plugin manager and the editor
 * work from rows (10 §10.2).
 */
import { refuseUnlessIdentical } from './hash.js';
export { fieldLabel, fieldAccepts } from './settings.js';
const types = new Map();
/**
 * A descriptor's display text, beyond the `i18n`/`description` pair every
 * declaration carries.
 *
 * `label` is what settings.ts calls the canonical key for a field or a member
 * band — `i18n` there is its deprecated alias — and those sit two levels down
 * inside `slots[].schema` and `entryShape.fields`. Renaming "Top K" was
 * therefore a hash change, which is exactly the edit src/hash.ts promises will
 * not put the reload loop back.
 *
 * ⚠ `title` is deliberately absent. `PanelDecl.title` is a heading, but
 * `EntryRoles.title` is which field the engine reads as a row's title —
 * contract, and moving one is an `@N+1` on purpose. One word, two answers, both
 * reachable from here, so a key-name rule cannot have it both ways; the panel
 * heading stays hashed until one of them is renamed.
 *
 * ## Exported, and it has to be
 *
 * The re-declaration guard below is not the only thing that asks whether two
 * descriptors are the same content. Core projects every descriptor into a
 * `pipeline_type_registry` row and hashes it again there, and that hash decides
 * whether an upgrading install may republish a frozen type version. The two
 * disagreed: core stripped `i18n` and `description` and hashed `label`, so
 * renaming a parameter was free here and a boot-time `TypeRegistryConflictError`
 * there — which `bootstrapPipelines` catches by returning early, silently
 * stopping every pipeline on the install.
 *
 * So the list is one value both sides import rather than two lists that happen
 * to match today. Adding a word here re-hashes every affected type and needs a
 * re-projection migration in core, exactly as adding one to `UNIVERSAL_DISPLAY`
 * would.
 */
export const DESCRIPTOR_DISPLAY_KEYS = { display: ['label'] };
function register(d) {
    // Content, not arrival (src/hash.ts). Only computed when there is something
    // to compare against, so the ordinary path costs nothing.
    const existing = types.get(d.id);
    if (existing)
        refuseUnlessIdentical(existing, d, `duplicate type id: ${d.id}`, DESCRIPTOR_DISPLAY_KEYS);
    checkWritePublishes(d);
    // Before the id is claimed, so a refused declaration can be fixed and retried.
    checkModeTitled(d);
    types.set(d.id, d);
    return d;
}
/**
 * A gate-eligible write publishes `write-result@1`, never raw ids (13 §7j-b).
 *
 * Checked at registration rather than reviewed by hand, because the hand-written version
 * was already wrong: three core Consumers declared `row-ids@1` out ports while declaring
 * `effects: 'write'`. Each one was a spec that could wire a downstream foreign key to a
 * row a reviewer had not approved yet — and under `async` review that row may never exist.
 * The failure lands long after the run that caused it, which is the worst kind to find by
 * reading.
 */
function checkWritePublishes(d) {
    if (d.effects !== 'write')
        return;
    const bad = Object.entries(d.ports?.out ?? {}).filter(([, s]) => shapeIdOf(s) === 'core:shape/row-ids@1');
    if (!bad.length)
        return;
    throw new Error(`${d.id} declares effects: 'write' but publishes core:shape/row-ids@1 on ` +
        `${bad.map(([k]) => `'${k}'`).join(', ')}. A gate-eligible write publishes ` +
        `core:shape/write-result@1 — pending under async review, committed otherwise — so a ` +
        `downstream port wanting raw ids fails at publish instead of writing a foreign key ` +
        `that dangles when the reviewer rejects (13 §7j-b).`);
}
const shapeIdOf = (s) => typeof s === 'string' ? s : (s?.id ?? undefined);
/** Is there any locale with actual text in it? */
const hasDisplayText = (v) => typeof v === 'string'
    ? v.trim().length > 0
    : !!v && Object.values(v).some((s) => typeof s === 'string' && s.trim().length > 0);
/**
 * A chat mode ships titled (19 §2).
 *
 * A shape-bearing input type *is* a chat mode, and the New Chat picker renders one card
 * per mode from rows — `i18n.name` is that card's face. An untitled mode could only
 * render as its type id, which is an address, not a name; refused here at declaration,
 * where the author is, rather than at install, where the admin is. A missing
 * `description` is a poorer card rather than a broken one, so the packager warns about
 * that instead of this throwing (cli/src/compiler.ts, W_MODE_NO_DESCRIPTION).
 */
function checkModeTitled(d) {
    if (d.kind !== 'input' || !d.sessionShape)
        return;
    if (hasDisplayText(d.i18n?.name))
        return;
    throw new Error(`${d.id} declares a sessionShape but no i18n.name. A shape-bearing input type is a ` +
        `session mode, and the New Session picker renders every mode as a card — give it a ` +
        `title: i18n: { name: { en: '…' } }. Add a description there too; the packager ` +
        `warns when a mode ships without one.`);
}
export function getType(id) {
    return types.get(id);
}
export function allTypes() {
    return [...types.values()];
}
export function _clearTypes() {
    types.clear();
}
// ── describe* — one per kind, same shape, no modality anywhere ───────────────
/**
 * ## Why every `describe*` is generic over its slots
 *
 * `Descriptor.slots` is the open `Record<string, SlotDecl>`, so a declaration
 * passed straight into it arrives with its **keys erased** — and with them the
 * `params` slot's `schema` keys, which is the entire declared parameter
 * vocabulary of the node. That erasure is what let `input.params.foo` be an
 * `any` lookup on a node whose schema has no `foo`: `topK` and `limit` were
 * both read that way for releases, off nodes that did declare them, at a
 * spelling nothing supplied.
 *
 * Capturing the argument in `S` keeps the literal keys, which is what
 * `InputOf` (src/nodeInput.ts) derives a handler's `input` type from.
 *
 * ⚠ **Type-level only.** `register()` still receives the same object and the
 * content hash is computed over the same runtime value, so nothing here moves a
 * declaration or re-hashes a type.
 *
 * ⚠ **`S` is constrained rather than `const`, and the difference is
 * deliberate.** `describeProvider` below needs the literal *values* — the
 * `optional: ['json_schema']` tuple `ctx.can()` narrows against — so it pays
 * for `const` with a validation done by intersection in the parameter. Names
 * are all `InputOf` needs, and an object literal keeps its own keys with or
 * without `const`; a `const` here would additionally freeze `accepts: [...]`
 * and `extras: [...]` into readonly tuples, which `SlotDecl` declares as
 * mutable `string[]` and which several core input and task types use.
 */
export const describeInput = (d) => register({ ...d, kind: 'input' });
export const describeQueryType = (d) => register({ ...d, kind: 'query' });
export const describeTaskType = (d) => register({ ...d, kind: 'task' });
/**
 * A Provider type.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 */
export const describeProvider = (
// The slot validation lives in the PARAMETER, not in `S`'s constraint. A
// constraint of `Record<string, SlotDecl>` widens each slot to SlotDecl's own
// declared types, so `optional: ['json_schema']` arrives as
// `readonly CapabilityId[]` and `ctx.can()` narrows to nothing. Intersecting
// here validates just as strictly while leaving `S` the literal it was written
// as — which is the whole basis of the typed probe.
d) => register({ ...d, kind: 'provider' });
export const describeConsumerTarget = (d) => register({ ...d, kind: 'consumer' });
// ── Entry types (Part 1) ────────────────────────────────────────────────────
//
// A lorebook row's *kind* is a declared, versioned type rather than the table
// it happens to sit in. Three near-identical tables collapse into one, and what
// used to be a schema fact — "world lore has a category, history has a year" —
// becomes a declaration the engine reads.
//
// What keeps that from turning into a swamp is the **field role**: the ranker asks
// the type which field is priority instead of reading `.priority`, so a fourth
// shape is a declaration and not a branch. Three constraints hold the line, and
// each is enforced here rather than reviewed by hand:
//
//  1. **No mini-DSLs.** `order` is an array of `{field, dir}`, never
//     `'date:year,month,day'`. A string the engine parses is code the type
//     ships with extra steps.
//  2. **A new behaviour may add a field role; a new type may not.** The vocabulary is
//     the frozen list below, and a conformance canary (`checkEntryTypes`)
//     watches both directions of it.
//  3. **Types never ship code.** Anything branchy is a *named, versioned,
//     core-owned policy* the type selects from a closed registry — mirroring
//     the deliberate absence of T3 validator code in values.ts.
/**
 * The field roles the engine reads. Frozen, and the reason it is frozen is rule 2
 * above: the list grows when a *behaviour* needs a new question answered, never
 * because a type has a field it would like consulted.
 */
export const ENTRY_ROLES = [
    /** Which field is this row's display title. */
    'title',
    /** How siblings sort among themselves — structured keys, never a string. */
    'order',
    /** Which field carries the manual 1..3 boost. Absent means **no bonus**. */
    'priority',
    /** Which reference column decides who may see this row, under which policy. */
    'anchor',
    /** Which fields make the text an embedding is computed over. */
    'embedText',
    /** Which field holds the trigger keys the keyword scan matches. */
    'key',
    /** Which reference column points at the row this one hangs under. */
    'parent',
];
/**
 * The budget bands a candidate can compete in — the engine's `RetrievalBand`,
 * closed on purpose.
 *
 * ⚠ Closed because the failure of an open one is **silent**: the signal-weight
 * and share maps are total over this union, so an entry type declaring a band
 * nobody budgets has its candidates scored against `undefined` and dropped with
 * a green test suite. That is not hypothetical — history was absent from every
 * prompt for two spec versions exactly this way. A new shape picks the band it
 * competes in; it does not mint one.
 */
export const ENTRY_SOURCE_KINDS = [
    'messages',
    'worldLore',
    'characterLore',
    'history',
    'relationships',
];
/**
 * The short name this type's rows carry on the wire — `extensions.serenepub`
 * in a character-card book.
 *
 * Closed to the three names already written into exported files. A type outside
 * them simply declares nothing here: no marker is honest, where a marker no
 * importer reads is a file that round-trips into the wrong shape. Widening the
 * list is a deliberate act with an importer change beside it.
 */
export const ENTRY_EXPORT_KEYS = ['world', 'character', 'history'];
/**
 * Visibility policies a type may select for its anchor.
 *
 * `core:policy/binding-visibility@1` is the four branches character lore
 * already has — character equality, persona membership, narrator-only when the
 * binding is unbound, invisible when the row is unanchored. That is *policy*,
 * so it is named, versioned and implemented by core; the type picks from this
 * list and never authors one (rule 3).
 */
export const ENTRY_ANCHOR_POLICIES = ['core:policy/binding-visibility@1'];
/**
 * Where a type's rows land when they are not rendered as a variable of their
 * own — a closed vocabulary of destinations, not a free string.
 *
 * `character-card` is today's character lore: qualifying entries are folded
 * into their bound character's own object under an "extra lore" key rather than
 * reaching a template as a list. One member, because one destination exists;
 * the point of the closed list is that the second one is a decision somebody
 * makes here rather than a string somebody types in a catalog.
 */
export const ENTRY_RENDER_DESTINATIONS = ['character-card'];
const ENTRY_TYPE_ID = /^([a-z0-9][a-z0-9.-]*):entry\/([a-z0-9][a-z0-9-]*)@(\d+)$/;
/**
 * Declare an entry type.
 *
 * The version lives in the id and therefore at every call site that names one,
 * which is the same convention `pin()` keeps for node types. What is
 * deliberately *not* here is a pinned constructor: `pin()` mints `v1()`, and
 * `v1()` builds a node a spec wires. An entry type is a row shape — there is
 * nothing to construct — so minting one would offer a call that can only ever
 * be a mistake.
 */
export const describeEntryType = (d) => {
    const { id, i18n, ...shape } = d;
    // Before the id is claimed, so a refused declaration can be fixed and
    // retried — the same order `checkModeTitled` runs in.
    assertEntryShape(id, shape);
    return register({
        id,
        i18n,
        kind: 'entry',
        // An entry type publishes nothing: it is not in the graph. Empty rather
        // than optional so `Descriptor` keeps meaning one thing for the five
        // kinds that are.
        ports: {},
        entryShape: shape,
    });
};
/** Every entry type this build declares. */
export const allEntryTypes = () => allTypes().filter((t) => t.kind === 'entry');
/**
 * Refusals at the author's line — an id, a namespace, and four closed
 * vocabularies.
 *
 * Throwing rather than collecting findings, because every one of these is a
 * typo or a decision somebody has to make, and none of them has a partial
 * answer worth keeping.
 */
function assertEntryShape(id, shape) {
    if (!ENTRY_TYPE_ID.test(id))
        throw new Error(`'${id}' is not a valid entry type id. The grammar is ` +
            `'<namespace>:entry/<name>@<major>' — 'core:entry/world-lore@1'. The version ` +
            `is the pin, exactly as for node types.`);
    /**
     * Core is the sole author of entry types, and this line is the switch.
     *
     * Not a permanent property of the design — an entry type is data, and
     * nothing about the projection cares who wrote it. What is missing is the
     * rest of the story: a plugin-authored type needs its constraint projection
     * gated, its `fields` reviewed and its rows owned. Until that exists the
     * honest state is off, said out loud, in one place.
     */
    if (!id.startsWith('core:'))
        throw new Error(`'${id}' cannot be declared: entry types are core-authored in this release. ` +
            `The row shape is data and nothing in the projection cares who wrote it, so ` +
            `this is a switch rather than a wall — but a plugin-owned type also owns a ` +
            `database constraint and the rows under it, and that half is not built.`);
    const unknown = unknownRoles(shape);
    if (unknown.length)
        throw new Error(`${id} declares ${unknown.map((r) => `'${r}'`).join(', ')}, which no engine ` +
            `behaviour reads. The field roles are ${ENTRY_ROLES.join(', ')} — a new *behaviour* ` +
            `may add one, a new *type* may not, or the vocabulary is just a second name ` +
            `for the field.`);
    if (!ENTRY_SOURCE_KINDS.includes(shape.sourceKind))
        throw new Error(`${id} declares sourceKind '${shape.sourceKind}', which is not a budget band. ` +
            `Pick one of ${ENTRY_SOURCE_KINDS.join(', ')} — the weight and share maps are ` +
            `total over those five, so a sixth name is not a new band, it is candidates ` +
            `scored against undefined and dropped with nothing reporting it.`);
    if (shape.exportKey && !ENTRY_EXPORT_KEYS.includes(shape.exportKey))
        throw new Error(`${id} declares exportKey '${shape.exportKey}', which no importer reads. The ` +
            `wire names are ${ENTRY_EXPORT_KEYS.join(', ')}; declare nothing to export ` +
            `without a marker.`);
    const policy = shape.roles?.anchor?.policy;
    if (policy && !ENTRY_ANCHOR_POLICIES.includes(policy))
        throw new Error(`${id} anchors under policy '${policy}', which core does not implement. Pick ` +
            `one of ${ENTRY_ANCHOR_POLICIES.join(', ')}. Types select policies; they ` +
            `never author them, which is what keeps a declaration from being code.`);
    const render = shape.render;
    if (typeof render === 'object' && !ENTRY_RENDER_DESTINATIONS.includes(render.into))
        throw new Error(`${id} renders into '${render.into}', which is not a destination. The ` +
            `destinations are ${ENTRY_RENDER_DESTINATIONS.join(', ')}; a variable id ` +
            `('core:var/world-lore@1') is the other legal value.`);
    if (typeof render === 'string' && !/^[a-z0-9][a-z0-9.-]*:var\/[a-z0-9-]+@\d+$/.test(render))
        throw new Error(`${id} renders as '${render}', which is not a variable id. Name the variable ` +
            `whose layout renders these rows — 'core:var/world-lore@1' — or fold them ` +
            `into a destination with { into: … }.`);
}
const unknownRoles = (shape) => Object.keys(shape.roles ?? {}).filter((r) => !ENTRY_ROLES.includes(r));
/**
 * The conformance canary — the field role vocabulary checked in **both** directions
 * (the shape values.ts's four-way registry canary already has).
 *
 * Forward: nothing declares a field role the engine does not read.
 * `describeEntryType`
 * refuses that at the author's line, so this is the backstop for declarations
 * that did not come through the door — a row written by another build, a type
 * read back from the registry.
 *
 * Backward, and this is the direction that earns the canary: **every field role
 * the engine reads is declared by somebody.** A field role no type answers is a
 * question
 * the engine asks nothing, and the vocabulary is frozen precisely so that one
 * gets deleted rather than sitting there looking supported.
 */
export function checkEntryTypes(types) {
    const findings = [];
    const declared = new Set();
    for (const t of types) {
        const shape = t.entryShape;
        if (!shape)
            continue;
        for (const role of Object.keys(shape.roles ?? {}))
            declared.add(role);
        for (const role of unknownRoles(shape))
            findings.push({
                severity: 'error',
                code: 'E_UNKNOWN_ROLE',
                where: t.id,
                message: `declares field role '${role}', which no engine behaviour reads`,
                fix: `use one of ${ENTRY_ROLES.join(', ')}, or add the field role here and the ` +
                    `behaviour that reads it in the same change. A field role only a declaration ` +
                    `knows about is a field with a longer name.`,
            });
    }
    for (const role of ENTRY_ROLES)
        if (!declared.has(role))
            findings.push({
                severity: 'error',
                code: 'E_DEAD_ROLE',
                where: role,
                message: `no entry type declares '${role}', so nothing answers it`,
                fix: `declare it on the type it describes, or delete the field role. The vocabulary ` +
                    `is frozen so that it stays small — an unanswered field role is one the engine ` +
                    `asks and nobody hears.`,
            });
    return findings;
}
export function pin(descriptor) {
    const version = /@(\d+)$/.exec(descriptor.id)?.[1] ?? '1';
    const ctor = (config = {}) => ({
        __node: true,
        descriptor,
        config,
    });
    return { [`v${version}`]: ctor, id: descriptor.id, descriptor };
}
//# sourceMappingURL=descriptors.js.map