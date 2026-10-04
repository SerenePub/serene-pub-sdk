/**
 * The widget data contract — ONE envelope every session widget receives,
 * native and frame alike (PLAN 25, ruled 2026-08-30).
 *
 * A native widget reads these sections through the host's in-document context
 * (live, reactive); a frame receives the same sections snapshotted over its
 * port. Field-for-field identical: reactivity is the native analog of a push,
 * and that is the whole of the difference. The declarations live here so the
 * two deliveries cannot drift — a plugin compiled against this package sees
 * exactly the shapes an instance sends.
 *
 * These types are TRANSPORT-NEUTRAL. The frame wire that carries them is
 * `surfaces.ts` (`HostFrameMessage` / `FrameHostMessage`); the host internals
 * that produce them — measuring a box, deciding a grant — are core's and are
 * not declared here.
 *
 * ## Two version clocks
 *
 *  - `WIDGET_PROTOCOL` versions the TRANSPORT — the verbs (`action` / `invoke`
 *    / `request` / `menu` / `on`) and the message kinds. Rev only when the wire
 *    itself changes.
 *  - Each DATA section is a bag of versioned shapes (`layout: { v1 }`, …). When
 *    a pre-existing key inside a section changes meaning, emit `v2` alongside
 *    `v1` for a transition window; old widgets read `.v1`, new ones read `.v2`.
 *    ADDITIVE keys go straight into the existing `v1` — no bump.
 *
 * ## Base vs scoped
 *
 * Base sections ({@link WIDGET_BASE_SECTIONS}: layout / session / channels /
 * messages / props / actions / settings / annex / locale / viewer /
 * turnOrder) are delivered to every widget that READS them (R75,
 * `WidgetDecl.reads`; a declaration without `reads` reads all of them, which
 * is every widget written before R75). Scoped sections
 * ({@link WidgetScopedSections}, the one table) appear ONLY when the widget
 * declared the scope AND it was granted — the same deny-by-default a frame
 * gets, applied at projection so a native widget is no more privileged.
 * Absence means "not granted", never a silent empty — or "not posted yet":
 * which of the two, the host says with `grants` (the scopes the widget
 * holds, on mount and on every change), so a widget draws "not granted"
 * rather than loading forever.
 */
/**
 * @experimental The message-row columns a host never posts to a widget — the
 * bookkeeping {@link MessageV1} withholds. The one list: a host's projection
 * ({@link projectMessageRow}) and `MessageV1`'s doc comment both follow it.
 */
export const MESSAGE_HOST_FIELDS = Object.freeze([
    'userId',
    'queueItemId',
    'debugMeta',
    'embedding',
    'embeddingModel',
    'embeddingSourceHash',
    'embedTextHash',
    'vectorizedAt',
    'version',
]);
const HOST_FIELD_SET = new Set(MESSAGE_HOST_FIELDS);
/**
 * @experimental A message row as it may cross to a widget: a shallow copy
 * without {@link MESSAGE_HOST_FIELDS}. Every road a row takes to a widget —
 * the `messages` post, a `channel` post, a `messages` page — goes through
 * this. A non-object is returned as it is.
 */
export function projectMessageRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row))
        return row;
    const out = {};
    for (const key of Object.keys(row))
        if (!HOST_FIELD_SET.has(key))
            out[key] = row[key];
    return out;
}
/**
 * {@link WidgetScopedSections} at runtime: scope → the name its section is
 * posted under. Typed off the table, so a scope missing here, or a name that
 * disagrees with it, does not compile.
 * @experimental
 */
export const WIDGET_SCOPED_SECTIONS = Object.freeze({
    'session:full': 'session_full',
    'session:state': 'session_state',
    persona: 'persona',
    characters: 'characters',
    lore: 'lore',
});
const SCOPED_SECTION_NAMES = new Set(Object.values(WIDGET_SCOPED_SECTIONS));
/** Is this a scoped section's posted name — what a receiver checks an incoming `scoped` message against. @experimental */
export const isWidgetScopedSectionName = (name) => typeof name === 'string' && SCOPED_SECTION_NAMES.has(name);
// Every base section, once: typed off `WidgetData`, so a section added there
// and not here — or named here and not there — does not compile.
const BASE_SECTIONS = {
    layout: true,
    session: true,
    channels: true,
    messages: true,
    props: true,
    actions: true,
    settings: true,
    annex: true,
    locale: true,
    viewer: true,
    turnOrder: true,
};
/**
 * The base sections, in the order the envelope declares them (R75): what
 * `WidgetDecl.reads` may name, and what a widget reads when it names none.
 * @experimental
 */
export const WIDGET_BASE_SECTIONS = Object.freeze(Object.keys(BASE_SECTIONS));
/**
 * The askers of every request kind — the marking a host enforces
 * ({@link widgetRequestRefusal}). Typed off {@link WidgetRequests}, so a kind
 * cannot be added without saying who may ask it.
 * @experimental
 */
export const WIDGET_REQUEST_ASKERS = Object.freeze({
    messages: 'any',
    'open-character': 'any',
    'view-avatar': 'any',
    'view-image': 'any',
    'open-lore': 'any',
    'prompt-details': 'any',
    'inspect-run': 'any',
    'pick-turn': 'any',
    'change-sprite': 'any',
    'actions-seen': 'core',
    summarize: 'core',
    send: 'core',
    'attach-files': 'core',
    'remove-tray-item': 'core',
    'remove-attachment': 'core',
    draft: 'core',
    'switch-persona': 'core',
    'add-persona': 'core',
    'fire-turn': 'core',
    'decide-proposal': 'core',
    'set-attribute-value': 'core',
    'set-sprite-set': 'core',
    'clear-scene-image': 'core',
    'session-entries': Object.freeze({ scope: 'lore' }),
    'set-entry-marks': 'core',
    'authors-note': 'core',
    'set-authors-note': 'core',
});
/** Every request kind — what a host checks an incoming `request` against. @experimental */
export const WIDGET_REQUEST_KINDS = Object.freeze(Object.keys(WIDGET_REQUEST_ASKERS));
/**
 * Why a host must decline this request from this widget, as a sentence — or
 * null when {@link WIDGET_REQUEST_ASKERS} lets it ask. `owner` is `'core'` or
 * the widget's plugin id; `grants` the scopes that widget was granted, as
 * BARE scopes (`'lore'`, `'session:state'`) — never the permission keys they
 * are reviewed as (`'widget:lore'`), which match nothing here. Core's widgets
 * hold every scope. A request is still not a grant: null means the host MAY
 * answer, never that it must. Grants that are not a list — a stored string,
 * whose `includes` would match a substring — grant nothing.
 * @experimental
 */
export function widgetRequestRefusal(kind, from) {
    if (!Object.hasOwn(WIDGET_REQUEST_ASKERS, kind))
        return `'${kind}' is not something a host answers`;
    const askers = WIDGET_REQUEST_ASKERS[kind];
    if (askers === 'any' || from.owner === 'core')
        return null;
    if (askers === 'core')
        return `only core's own widgets ask '${kind}'`;
    return Array.isArray(from.grants) && from.grants.includes(askers.scope)
        ? null
        : `'${kind}' reads what the '${askers.scope}' scope covers, and this widget was not granted it`;
}
/**
 * 🚧 The scope a widget must hold to HEAR an event kind (R81) — a kind not
 * listed is heard by every widget its channel reaches. An event about scoped
 * data is scoped data: a widget that may not read the lore is not told when
 * it moved. Read by {@link widgetEventHeard}, which every host delivery of
 * widget events asks.
 * @experimental
 */
export const WIDGET_EVENT_SCOPES = Object.freeze({
    'lore:ranked': 'lore',
    'lore:marked': 'lore',
});
/**
 * Is this widget told of an event of this kind? Core's widgets hold every
 * scope; a plugin's hears a scoped kind only when granted its scope — as
 * BARE scopes (`'lore'`), never the permission keys (`'widget:lore'`); grants
 * that are not a list grant nothing (the rule {@link widgetRequestRefusal}
 * holds a request to).
 * @experimental
 */
export function widgetEventHeard(kind, to) {
    const scope = Object.hasOwn(WIDGET_EVENT_SCOPES, kind) ? WIDGET_EVENT_SCOPES[kind] : undefined;
    if (!scope || to.owner === 'core')
        return true;
    return Array.isArray(to.grants) && to.grants.includes(scope);
}
/**
 * The version of the widget contract — the verbs above and the message kinds
 * that carry them.
 *
 * ONE number for both deliveries: native IS frame minus the iframe (ruled
 * 2026-09-08), so a second clock for the in-document lane would be a second
 * contract by accident. `FRAME_PROTOCOL` in `surfaces.ts` is this constant
 * under the name the frame wire spells it, and the frame's `init` carries it.
 * @experimental
 */
export const WIDGET_PROTOCOL = 2;
//# sourceMappingURL=widgets.js.map