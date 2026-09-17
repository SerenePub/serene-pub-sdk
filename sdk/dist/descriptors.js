/**
 * Descriptors — the shared-scope declaration of a **node definition** (01 §1, 04 §3;
 * NOMENCLATURE §5 — *node type* is retired, ruled 2026-09-14).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the handler that implements it. That is what lets the plugin manager and the
 * editor work from rows (10 §10.2).
 */
import { refuseUnlessIdentical } from './hash.js';
export { fieldLabel, fieldAccepts } from './settings.js';
/**
 * The text-transform kind, spelled here rather than imported: scripts.ts
 * imports from this module, and it is the one kind every point accepted
 * before points could say otherwise.
 */
const TEXT_TRANSFORM_KIND = 'core:script:text/transform@1';
/**
 * A definition's interior points, every one in the full shape.
 *
 * The one reader of `scriptPoints` — the executor's broker and the registry
 * projection both go through it — so the deprecated spellings are folded in
 * one place: a bare string is a text-transform point, an object declared
 * before points carried `accepts` (a plugin built against the previous
 * release) is read the same way, and `i18n` becomes `label`. Returns copies;
 * a caller may not edit the declaration through it.
 */
export function scriptPointsOf(d) {
    return (d.scriptPoints ?? []).map((p) => {
        if (typeof p === 'string')
            return { key: p, accepts: [TEXT_TRANSFORM_KIND] };
        const { i18n, ...point } = p;
        // Folded only when `accepts` is ABSENT — the pre-R-11 spelling. An
        // explicit `[]` is authored and reaches the reader as written; `register`
        // refuses it (`checkScriptPointsAccept`), because a point accepting
        // nothing is a hook nothing can attach to.
        const accepts = Array.isArray(point.accepts) ? [...point.accepts] : [TEXT_TRANSFORM_KIND];
        const label = point.label ?? i18n;
        return {
            ...point,
            key: String(point.key),
            accepts,
            ...(label ? { label } : {}),
        };
    });
}
/**
 * The message verbs no genre may remove (R-15, ruled 2026-09-15): a person
 * can always stop a reply, branch a session and rewrite a line. Not keys of
 * `SessionShape.messageVerbs`; a declaration naming one `false` is refused
 * at registration (`assertMessageVerbFloors`).
 */
export const MESSAGE_VERB_FLOORS = ['stop', 'branch', 'edit'];
/**
 * The opt-in built-ins: core's writes a genre may switch off and never
 * re-implement. Default on.
 */
export const MESSAGE_VERB_BUILT_INS = ['delete', 'hide', 'swipe'];
/** The genre-declared content actions — built-in write + declared content. */
export const MESSAGE_VERB_CONTENT = ['retry', 'continue', 'stepBack'];
/** Every forbiddable verb, in the order the availability map reads them. */
export const MESSAGE_VERBS = [...MESSAGE_VERB_CONTENT, ...MESSAGE_VERB_BUILT_INS];
/**
 * The five built-in writes (R-15), by the verb a person knows them as: the
 * one-node spec core runs for each, and the outlet that spec ends in.
 *
 * Here rather than only in the core catalog because the **validator** needs
 * them (U5b review W8): a built-in outlet performs the item rule's write —
 * the handler judged who may act on which row before the run began — so a
 * spec that is not the built-in's own placing one would perform that write
 * with nobody having judged anything. `validate()` refuses the placement
 * unless the document's id is one of `BUILTIN_SPEC_IDS`, and the host
 * refuses the commit on the same test (defence in depth). A manifest
 * permission letting a plugin spec place one is the future this leaves room
 * for; it is not granted today.
 */
export const BUILTIN_SPEC_IDS = Object.freeze({
    delete: 'core:spec/builtin-delete',
    hide: 'core:spec/builtin-hide',
    edit: 'core:spec/builtin-edit',
    swipe: 'core:spec/builtin-swipe',
    branch: 'core:spec/builtin-branch',
});
/** The outlet each built-in's spec ends in — `effects: 'write'`, every one. */
export const BUILTIN_OUTLET_IDS = Object.freeze({
    delete: 'core:outlet/delete-message@1',
    hide: 'core:outlet/hide-message@1',
    edit: 'core:outlet/edit-message@1',
    swipe: 'core:outlet/swipe-message@1',
    branch: 'core:outlet/branch-session@1',
});
/** Is this definition id one of the five built-in write outlets? */
export const isBuiltInOutlet = (definitionId) => Object.values(BUILTIN_OUTLET_IDS).includes(definitionId);
/** Is this spec id one of the five built-in specs — the only documents that may place a built-in outlet? */
export const isBuiltInSpec = (specId) => Object.values(BUILTIN_SPEC_IDS).includes(specId);
/**
 * The form-answer pair (plans/29 R-15 *Forms*; 30 §U5d, built 2026-09-17):
 * the inlet `core:event/form-addressed@1` lands on, and the outlet that
 * commits an oracle's answer exactly as a click would. The outlet may be
 * placed only in a document whose inlet is the form-addressed one
 * (`validate()`; the host checks the same at the commit): it answers THE
 * form the event carried, and a document reached by any other event has no
 * form to answer — a spec placing it elsewhere would fire an action as
 * somebody nobody asked.
 */
export const FORM_ADDRESSED_INLET_ID = 'core:inlet/form-addressed@1';
export const ANSWER_FORM_OUTLET_ID = 'core:outlet/answer-form@1';
/**
 * The review-fields rule (R-15 *The review gate*; 30 §U5d): a definition
 * with `effects: 'write' | 'external'` declares `review: { fields }` — what a
 * reviewer may edit at the gate, `[]` when nothing (approve or refuse). A
 * definition that declares none still registers and still gates — the form
 * is then **inferred** from the whole payload, every field editable, which is
 * the documented fallback a plugin definition gets — but `register()` records
 * the omission as a finding and `validate()` reports it on every node bound
 * to such a definition, so a shipped effectful definition without one is
 * visible rather than silent. Every core definition declares one.
 */
export function reviewFieldsFinding(d) {
    if (d.effects !== 'write' && d.effects !== 'external')
        return null;
    if (d.review && Array.isArray(d.review.fields))
        return null;
    return (`${d.id} declares effects: '${d.effects}' and no review.fields. An effectful definition ` +
        `says which of its in-ports a reviewer may edit at the gate — review: { fields: ['text'] }, ` +
        `or review: { fields: [] } when the gate is approve-or-refuse. Until it does, the form is ` +
        `inferred from the whole payload and every field is editable, including any row id.`);
}
const registrationFindings = new Map();
/**
 * What `register()` noted about a definition without refusing it — today
 * the review-fields rule alone. Keyed by definition id; empty for a clean
 * one. Read by a host at boot to say so once, and by tests asserting that
 * every shipped effectful definition declares its fields.
 */
export function definitionFindings(id) {
    if (id !== undefined)
        return [...(registrationFindings.get(id) ?? [])];
    return [...registrationFindings.values()].flat();
}
/**
 * A `messageVerbs` declaration that names a floor `false` is refused — with a
 * sentence, at the declaration, where the author is. Shared by `register`
 * (an inlet's `sessionShape`) and `genre()` (a genre's `shape`), so the two
 * places a shape can be declared cannot disagree about what a floor is.
 * Unknown keys are ignored, as the app's reader ignores them: a key this
 * release does not know is not a floor.
 */
export function assertMessageVerbFloors(shape, who) {
    const verbs = shape?.messageVerbs;
    if (!verbs || typeof verbs !== 'object')
        return;
    const forbidden = MESSAGE_VERB_FLOORS.filter((floor) => verbs[floor] === false);
    if (!forbidden.length)
        return;
    throw new Error(`${who} declares messageVerbs { ${forbidden.map((f) => `${f}: false`).join(', ')} }. ` +
        `Stop, branch and edit are floors — present in every genre, never switched off ` +
        `(R-15). A genre may switch off delete, hide or swipe, and may forbid retry, ` +
        `continue or stepBack; drop the floor from the declaration.`);
}
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
 * `pipeline_definition_registry` row and hashes it again there, and that hash decides
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
    checkNoAuthoredSettings(d);
    checkScriptPointsAccept(d);
    // Before the id is claimed, so a refused declaration can be fixed and retried.
    checkModeTitled(d);
    assertMessageVerbFloors(d.sessionShape, d.id);
    // A finding, not a refusal: the fallback is documented (inference), the
    // omission is recorded, and `validate()` says it on every placement.
    const reviewFinding = reviewFieldsFinding(d);
    if (reviewFinding)
        registrationFindings.set(d.id, [reviewFinding]);
    else
        registrationFindings.delete(d.id);
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
/**
 * `settings` is the substrate's slot, never an author's (R-9).
 *
 * Refused at registration rather than merged, because the two would collide
 * at one address: the executor reads `config[key].settings.enabled` to skip
 * an optional node and `.review` to gate a write, and an authored field of
 * the same name would be read as that switch. It is also what lets the
 * registry hash leave the projected slot out — a slot that is never authored
 * is never a change to what an author declared.
 */
function checkNoAuthoredSettings(d) {
    if (!d.slots)
        return;
    if ('settings' in d.slots)
        throw new Error(`${d.id} declares a slot named 'settings'. That name is reserved for the substrate's ` +
            `own slot — \`enabled\` on an optional node, \`review\` on a gated one — which the ` +
            `registry projection declares and the executor reads. Name the slot for what it ` +
            `holds ('parameters' for tunables).`);
    // By kind as well as by name (U4 residual, 2026-09-16): a slot called
    // anything else but declared `kind: 'settings'` would render through the
    // substrate's branch of the panel and hash as authored material, which is
    // the same collision one address over.
    const byKind = Object.entries(d.slots).find(([, decl]) => decl?.kind === 'settings');
    if (byKind)
        throw new Error(`${d.id} declares slot '${byKind[0]}' with kind 'settings'. That kind is the ` +
            `substrate's — derived from \`optional\` and \`effects\`, never authored. Declare ` +
            `'parameters' for tunables.`);
}
/**
 * A script point that accepts nothing is refused (R-11; U4 residual 2026-09-16).
 *
 * `scriptPointsOf` folds an ABSENT `accepts` to text/transform for the
 * pre-R-11 spelling, and reads an explicit `[]` as written — so the empty
 * list has to be caught where the author is. A point nothing can attach to
 * is a control with no effect wearing a contract: the panel would offer the
 * hook and every kind would be refused at it.
 */
function checkScriptPointsAccept(d) {
    for (const p of d.scriptPoints ?? []) {
        if (typeof p === 'string')
            continue;
        const accepts = p.accepts;
        if (Array.isArray(accepts) && accepts.length === 0)
            throw new Error(`${d.id} declares script point '${String(p.key)}' with ` +
                `accepts: []. A point that accepts no script kind is a hook nothing can attach to — ` +
                `list the kinds it takes (e.g. ['${TEXT_TRANSFORM_KIND}']), or omit \`accepts\` ` +
                `for the text-transform default.`);
    }
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
    if (d.kind !== 'inlet' || !d.sessionShape)
        return;
    if (hasDisplayText(d.i18n?.name))
        return;
    throw new Error(`${d.id} declares a sessionShape but no i18n.name. A shape-bearing input type is a ` +
        `session mode, and the New Session picker renders every mode as a card — give it a ` +
        `title: i18n: { name: { en: '…' } }. Add a description there too; the packager ` +
        `warns when a mode ships without one.`);
}
export function getDefinition(id) {
    return types.get(id);
}
export function allDefinitions() {
    return [...types.values()];
}
export function _clearDefinitions() {
    types.clear();
    registrationFindings.clear();
}
// ── describe*Definition — one per kind, same shape, no modality anywhere ─────
//
// `describeInletDefinition · describeQueryDefinition · describeTaskDefinition ·
// describeOracleDefinition · describeOutletDefinition` (was `describeInput`,
// `describeQueryType`, `describeTaskType`, `describeProvider`,
// `describeConsumerTarget`; 2026-09-16). `describeEntryType` keeps *type*: the
// entry-type word is not yet ruled (NOMENCLATURE §5).
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
 * deliberate.** `describeOracleDefinition` below needs the literal *values* — the
 * `optional: ['json_schema']` tuple `ctx.can()` narrows against — so it pays
 * for `const` with a validation done by intersection in the parameter. Names
 * are all `InputOf` needs, and an object literal keeps its own keys with or
 * without `const`; a `const` here would additionally freeze `accepts: [...]`
 * and `extras: [...]` into readonly tuples, which `SlotDecl` declares as
 * mutable `string[]` and which several core input and task types use.
 */
export const describeInletDefinition = (d) => register({ ...d, kind: 'inlet' });
export const describeQueryDefinition = (d) => register({ ...d, kind: 'query' });
export const describeTaskDefinition = (d) => register({ ...d, kind: 'task' });
/**
 * An oracle definition.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 */
export const describeOracleDefinition = (
// The slot validation lives in the PARAMETER, not in `S`'s constraint. A
// constraint of `Record<string, SlotDecl>` widens each slot to SlotDecl's own
// declared types, so `optional: ['json_schema']` arrives as
// `readonly CapabilityId[]` and `ctx.can()` narrows to nothing. Intersecting
// here validates just as strictly while leaving `S` the literal it was written
// as — which is the whole basis of the typed probe.
d) => register({ ...d, kind: 'oracle' });
export const describeOutletDefinition = (d) => register({ ...d, kind: 'outlet' });
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
 * which is the same convention `pin()` keeps for node definitions. What is
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
export const allEntryTypes = () => allDefinitions().filter((t) => t.kind === 'entry');
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
            `is the pin, exactly as for node definitions.`);
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