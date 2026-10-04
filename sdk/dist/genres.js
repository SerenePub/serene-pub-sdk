import { widgetRef } from './widgetDecls.js';
import { drawnWidgetIds, layoutWidgetIds, widgetOfInstance } from './sessionLayout.js';
import { assertChannelDecls, assertMessageVerbFloors, assertSessionWrites, assertTurnControls, channelDecls, widgetDeclsFindings, } from './descriptors.js';
import { i18nFindings, localeMapOf } from './i18n.js';
import { eventById, notADeclaredEvent } from './events.js';
import { settingsSchemaFindings } from './settings.js';
import { getAttributeSlot } from './attributes.js';
import { refuseUnlessIdentical } from './hash.js';
import { isActionIdentity } from './identity.js';
import { enabledWhenFindings, normalizeEnabledWhen, } from './predicates.js';
/** `owner:genre/name` — lowercase, digits, hyphens, dots in the owner. */
const GENRE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:genre\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** @experimental */
export function assertGenreId(id) {
    if (!GENRE_ID.test(id))
        throw new Error(`'${id}' is not a valid genre id. Use 'owner:genre/name' — 'core:genre/chat', ` +
            `'acme.rp:genre/mystery'. The id is an address sessions hold for their ` +
            `lifetime; the display name lives in the declaration.`);
}
/**
 * The core session events (24 §5), as **event ids** — `core:event/<name>@1`.
 *
 * Constants so the core vocabulary is typo-proof. Since R-4 (ruled 2026-09-15,
 * landed 2026-09-16) these ARE `CORE_EVENTS` entries (`events.ts`): one
 * registry, and a genre's event surface, a preset's `bindings` map and a spec's
 * inlet lock are all keyed by these ids. The bare names (`session-created`)
 * were the keys until the fold; a host migrates its stored keys once.
 * @public
 */
export const sessionEvents = Object.freeze({
    /** The create slot — required; exactly one pipeline per genre declares it. */
    sessionCreated: 'core:event/session-created@1',
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    messageRespond: 'core:event/message-respond@1',
    /** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
    sessionAction: 'core:event/session-action@1',
    /** A character or persona joined; payload carries the kind. */
    memberAdded: 'core:event/member-added@1',
    /** A character or persona left; payload carries the kind. */
    memberRemoved: 'core:event/member-removed@1',
    /**
     * A form in a message was addressed to a participant the AI portrays
     * (R-15 *Forms*; U5d). Optional in every genre's surface: a genre that
     * binds nothing leaves such a form waiting, as it would for a person.
     */
    formAddressed: 'core:event/form-addressed@1',
    // ── Turn order as event-driven state (PLAN-turn-order §4.1, 2026-09-21) ──
    // The events a genre may bind its turn-order spec to. A genre that
    // binds the spec lists every event it binds it to, all optional (`{}`).
    /** A row that is not generating landed — a send, a greeting, a finished or stopped reply. */
    messageCompleted: 'core:event/message-completed@1',
    /** A person rewrote a settled message. */
    messageEdited: 'core:event/message-edited@1',
    /** A message was deleted. */
    messageDeleted: 'core:event/message-deleted@1',
    /** A message was hidden from the prompt, or shown again. */
    messageHidden: 'core:event/message-hidden@1',
    /** A line's shown sprite changed — a picker's choice or a person's (DESIGN-sprites). */
    spriteShown: 'core:event/sprite-shown@1',
    /** A seated participant's row changed — active, position, visibility or portrayal. */
    castChanged: 'core:event/cast-changed@1',
    /** `sessions:update` landed — name, scenario, lorebook, genre fields, preset, channels, tags. */
    sessionUpdated: 'core:event/session-updated@1',
    /** A session was branched at a message into a new session; recorded on the branch. */
    sessionBranched: 'core:event/session-branched@1',
    /**
     * A pipeline's annex entry changed — "my state changed". Caused by
     * `core:outlet/set-session-annex@1`; the payload names the owner.
     */
    annexChanged: 'core:event/annex-changed@1',
    /**
     * `metadata.turnOrder` was written. **For typing only**: core-internal,
     * read by the auto-advance listener and the `sessions:turnOrder` push;
     * `genre()` refuses it in `events`, so no preset can bind it.
     */
    turnOrderChanged: 'core:event/turn-order-changed@1',
});
/**
 * Why no genre may list, and no spec may lock, `turn-order-changed`
 * (PLAN-turn-order §4.1): the turn-order write's own event is core-internal.
 * One sentence for `genre()`, the builder's `.inlet()` and the package pass.
 * @experimental
 */
export const TURN_ORDER_CHANGED_IS_INTERNAL = `'${sessionEvents.turnOrderChanged}' is core-internal — the auto-advance listener and the ` +
    `turn-order push read it, and a pipeline bound to it would recompute the order it was told ` +
    `about. Bind '${sessionEvents.messageCompleted}' and the other session events instead.`;
/** Does this genre let its sessions track attributes beyond its own? Unstated is `'deny'`. @experimental */
export const genreAllowsCustomAttributes = (g) => (typeof g === 'string' ? registry.get(g) : g)?.customAttributes === 'allow';
/**
 * The name a line nobody claims is shown and prompted under when its genre
 * declares no fallback envoy (`EnvoyDecl.fallback`) — display text (R-20), read
 * in the viewer's language. The host's last resort, so no line is ever
 * attributed to "Unknown" (ruled 2026-09-26). The same word the host already
 * gives narration with no narrator name.
 * @experimental
 */
export const UNCLAIMED_LINE_NAME = Object.freeze({ en: 'Narrator' });
/** An envoy's key: a lowercase kebab token. Dots are reserved for an action's namespace. @experimental */
export const ENVOY_KEY = /^[a-z][a-z0-9-]*$/;
/** An envoy's image: an `http(s)://` URL or a `data:image/…` URI — an `<img>` source, nothing else. @experimental */
export const ENVOY_IMAGE = /^(?:https?:\/\/\S+|data:image\/[a-z0-9.+-]+(?:;[^,]*)?,.+)$/i;
const ENVOY_SPEAKS = new Set(['in-turn', 'on-action']);
/**
 * Every fault in one envoy declaration, as sentences (the teaching-error
 * pattern, 15 §1.3). Empty when it is sound. `owner` says which of the two
 * declaring places this is, because an action's envoy has one rule of its own:
 * it may only be `on-action`.
 * @internal
 */
export function envoyFindings(raw, at, owner = 'genre') {
    const out = [];
    if (!raw || typeof raw !== 'object')
        return [`${at}: an envoy is an object — got ${typeof raw}`];
    const e = raw;
    const where = `${at}[${typeof e.key === 'string' ? e.key : '?'}]`;
    if (typeof e.key !== 'string' || !ENVOY_KEY.test(e.key))
        out.push(`${where}: 'key' is required — a lowercase kebab token (${ENVOY_KEY.source}); ` +
            `an action's envoy is namespaced by the host, never by the key`);
    out.push(...i18nFindings(e.name, `${where}.name`, { required: true }));
    out.push(...i18nFindings(e.description, `${where}.description`));
    if (e.image !== undefined && (typeof e.image !== 'string' || !ENVOY_IMAGE.test(e.image)))
        out.push(`${where}: 'image' is an http(s):// URL or a data:image/… URI — an <img> source and nothing else`);
    if (e.prompts !== undefined) {
        if (!e.prompts || typeof e.prompts !== 'object')
            out.push(`${where}: 'prompts' is { systemPrompt?, postHistoryInstructions? }`);
        else
            for (const [k, v] of Object.entries(e.prompts))
                if (typeof v !== 'string')
                    out.push(`${where}: prompts.${k} is a string — the authored text`);
    }
    if (e.default !== undefined && typeof e.default !== 'boolean')
        out.push(`${where}: 'default' is a boolean`);
    if (e.fallback !== undefined) {
        if (typeof e.fallback !== 'boolean')
            out.push(`${where}: 'fallback' is a boolean`);
        else if (owner === 'action' && e.fallback)
            out.push(`${where}: an action's envoy cannot be the fallback — it speaks for its action only; ` +
                `declare the fallback on the genre's envoys`);
    }
    if (e.greeting !== undefined) {
        const g = e.greeting;
        if (owner === 'action')
            out.push(`${where}: an action's envoy cannot declare a greeting — it speaks for its action ` +
                `only; declare the greeting on the genre's envoy (R6)`);
        else if (!g || typeof g !== 'object' || Array.isArray(g))
            out.push(`${where}: 'greeting' is { text, channel? } — the line this envoy opens a new session with`);
        else {
            out.push(...i18nFindings(g.text, `${where}.greeting.text`, { required: true }));
            if (g.channel !== undefined && (typeof g.channel !== 'string' || !g.channel.trim()))
                out.push(`${where}: greeting.channel is a channel slug the genre declares — 'main' when absent`);
        }
    }
    if (e.speaks !== undefined) {
        if (!ENVOY_SPEAKS.has(e.speaks))
            out.push(`${where}: 'speaks' is 'in-turn' or 'on-action' (R-21 (6))`);
        else if (owner === 'action' && e.speaks !== 'on-action')
            out.push(`${where}: an action's envoy speaks 'on-action' only — it is the speaker the ` +
                `action's results post as, never a turn-taking candidate (R-21 (6))`);
    }
    return out;
}
/**
 * The findings on a genre's whole list: each entry's, plus unique keys, at
 * most one default, and — given the genre's `channels` (slugs, `main`
 * included; R6) — a greeting on a channel the genre does not declare.
 * @internal
 */
export function envoysFindings(raw, at = 'envoys', channels) {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        return [`${at}: a genre's envoys are an array`];
    const out = [];
    const keys = new Map();
    let defaults = 0;
    const fallbacks = [];
    raw.forEach((e, i) => {
        out.push(...envoyFindings(e, at, 'genre'));
        const key = e?.key;
        if (typeof key === 'string')
            keys.set(key, (keys.get(key) ?? 0) + 1);
        if (e?.default === true)
            defaults++;
        if (e?.fallback === true)
            fallbacks.push(typeof key === 'string' ? key : '?');
        const lands = e?.greeting?.channel;
        if (channels && typeof lands === 'string' && lands.trim() && !channels.includes(lands.trim()))
            out.push(`${at}[${typeof key === 'string' ? key : '?'}]: greeting.channel '${lands}' is not a channel ` +
                `this genre declares — it declares ${channels.map((c) => `'${c}'`).join(', ')} (R6)`);
        void i;
    });
    if (fallbacks.length > 1)
        out.push(`${at}: ${fallbacks.map((k) => `'${k}'`).join(', ')} are all 'fallback: true' — a line nobody ` +
            `claims posts as one envoy; mark one`);
    for (const [key, n] of keys)
        if (n > 1)
            out.push(`${at}: the key '${key}' is declared ${n} times — an envoy's key is unique within its genre`);
    if (defaults > 1)
        out.push(`${at}: ${defaults} envoys are 'default: true' — at most one is seated with no choice; ` +
            `the rest are offered`);
    return out;
}
/** One envoy in its document form: `speaks` stated, nothing else added. @experimental */
export function normalizeEnvoy(raw, speaks) {
    return Object.freeze({ ...raw, speaks });
}
/**
 * A genre's enabled-when defaults, as findings: keyed by an action identity
 * (`<spec>#<key>`, or `core#<verb>`), each value a predicate or a list judged
 * by `enabledWhenFindings`. Empty when sound or absent.
 * @experimental
 */
export function genreEnabledWhenFindings(raw, at = 'enabledWhen') {
    if (raw === undefined)
        return [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return [
            `${at}: a genre's enabled-when defaults are an object keyed by action identity — ` +
                `{ 'core:spec/look#look': { on: 'state.world.location', truthy: true, reason: { en: '…' } } }`,
        ];
    const out = [];
    for (const [id, decl] of Object.entries(raw)) {
        if (!isActionIdentity(id))
            out.push(`${at}: a default is keyed by the identity of the action it applies to — ` +
                `'<spec slug>#<key>', or 'core#<verb>' for a message verb — got '${id}'`);
        out.push(...enabledWhenFindings(decl, `${at}[${id}]`));
    }
    return out;
}
function assertEnabledWhen(decl, genreId) {
    if (!decl)
        return undefined;
    const findings = genreEnabledWhenFindings(decl, `${genreId}.enabledWhen`);
    if (findings.length)
        throw new Error(findings.join('\n'));
    const out = {};
    for (const [fn, v] of Object.entries(decl))
        out[fn] = Object.freeze(normalizeEnabledWhen(v));
    return Object.freeze(out);
}
/**
 * Every display string a genre carries (R-20): `name` (required) and
 * `description`; the shape's `fields` schema and its `panels[]` titles; and
 * the `label` / `description` of every slot and sheet it brings. The slots and
 * sheets passed their own doors already; they are read again here because a
 * genre is the declaration a session is created under, and a picker card that
 * lists a slot with no label is this genre's defect to hear about.
 * @experimental
 */
export function genreDisplayTextFindings(props, at) {
    const out = [];
    out.push(...i18nFindings(props.name, `${at}.name`, { required: true }));
    out.push(...i18nFindings(props.description, `${at}.description`));
    if (props.shape) {
        out.push(...settingsSchemaFindings(props.shape.fields, `${at}.shape.fields`));
        out.push(...widgetDeclsFindings(props.shape.panels, `${at}.shape.panels`));
    }
    for (const slot of props.slots ?? []) {
        out.push(...i18nFindings(slot.label, `${at}.slots[${slot.id}].label`));
        out.push(...i18nFindings(slot.description, `${at}.slots[${slot.id}].description`));
    }
    for (const sheet of props.sheets ?? []) {
        out.push(...i18nFindings(sheet.label, `${at}.sheets[${sheet.id}].label`, { required: true }));
        out.push(...i18nFindings(sheet.description, `${at}.sheets[${sheet.id}].description`));
    }
    return out;
}
function assertDisplayText(props, genreId) {
    const findings = genreDisplayTextFindings(props, genreId);
    if (findings.length)
        throw new Error(findings.join('\n'));
}
/**
 * `GenreProps.playerLabel` (R4), checked and normalised: display text with an
 * `en` (R-20), as a frozen locale map — and refused for a genre where a
 * persona always names the person's line (`shape.personas.min ≥ 1`), because
 * nothing there would ever carry it.
 */
function assertPlayerLabel(props, genreId) {
    if (props.playerLabel === undefined)
        return undefined;
    const findings = i18nFindings(props.playerLabel, `${genreId}.playerLabel`);
    if (findings.length)
        throw new Error(findings.join('\n'));
    if ((props.shape?.personas?.min ?? 0) >= 1)
        throw new Error(`${genreId}.playerLabel: this genre requires a persona (shape.personas.min ≥ 1), so a persona ` +
            `always names the person's line and no line would ever carry the label — drop playerLabel, ` +
            `or let the genre run without a persona`);
    return Object.freeze({ ...localeMapOf(props.playerLabel) });
}
function assertEnvoys(envoys, genreId, shape) {
    if (!envoys)
        return [];
    const findings = envoysFindings(envoys, `${genreId}.envoys`, channelDecls(shape).map((c) => c.slug));
    if (findings.length)
        throw new Error(findings.join('\n'));
    return envoys.map((e) => normalizeEnvoy(e, e.speaks ?? 'in-turn'));
}
/** Core's conversation widget — the primary widget a genre must replace if it withholds it. @internal */
export const CONVERSATION_WIDGET_ID = 'messages';
/** `omitWidgets` read down to ids, and `layouts` checked (R71). */
function assertGenreWidgets(props, id) {
    const problems = [];
    const omitWidgets = [];
    for (const w of props.omitWidgets ?? []) {
        if (typeof w === 'string') {
            problems.push(`${id} omitWidgets: '${w}' is a string — name the widget value (coreWidgets.x, or the package's widget)`);
            continue;
        }
        try {
            omitWidgets.push(widgetRef(w));
        }
        catch (e) {
            problems.push(`${id} omitWidgets: ${e.message}`);
        }
    }
    const layouts = [...(props.layouts ?? [])];
    // The first is the genre's default, and the instance seeds a genre's
    // default by its slug.
    if (layouts.length && layouts[0].slug !== 'default')
        problems.push(`${id} layouts: the first is the genre's default — give it slug 'default' (it is '${layouts[0].slug}')`);
    const slugs = new Set();
    for (const l of layouts) {
        if (slugs.has(l.slug))
            problems.push(`${id} layouts: two layouts are '${l.slug}' — a slug names one`);
        slugs.add(l.slug);
        // By widget, not by instance: `messages#sanctum` places the conversation.
        for (const w of layoutWidgetIds(l.preset))
            if (omitWidgets.includes(widgetOfInstance(w)))
                problems.push(`${id} layout '${l.slug}' places '${w}', which the genre omits`);
    }
    // The primary floor: a session always draws its primary widget. A genre
    // that withholds the conversation says what stands in its place — its
    // package's `role: 'primary'` widget — in the layout it ships first, in any
    // zone (placement is free). Which widget that is, the widget's declaration
    // says, and a genre holds only ids: so this asks that the layout draws
    // something, and the package pass (`genreLayoutFindings`, run by
    // `defineExtension` and the packager) that what it draws is primary.
    if (omitWidgets.includes(CONVERSATION_WIDGET_ID)) {
        const first = layouts[0];
        if (!first || !drawnWidgetIds(first.preset).length)
            problems.push(`${id} omits the conversation — ship a layout (layouts: [layout({ … })]) that places ` +
                `the widget that takes its place (its role: 'primary' widget), in any zone`);
    }
    if (problems.length)
        throw new Error(problems.join('\n'));
    return { omitWidgets: [...new Set(omitWidgets)], layouts };
}
/**
 * Declare a genre. The id is stated in full, under your plugin's slug
 * (`acme.dice:genre/table`), and the genre value is what everything else
 * references.
 * @public
 */
export function genre(id, props) {
    assertGenreId(id);
    // The floors (R-15): a genre that switches off stop, branch or edit is
    // refused here, at the declaration, on the same terms as an inlet's shape.
    assertMessageVerbFloors(props.shape, id);
    // The writes (R-B) and the channel declarations (R-C): refused here too,
    // on the same terms and for the same reason — a `writes.lore: 'no'` or a
    // channel declared `role: 'prose'` is an authoring mistake, not a value to
    // degrade at the write site where nobody is reading.
    assertSessionWrites(props.shape, id);
    assertTurnControls(props.shape, id);
    assertChannelDecls(props.shape, id);
    const events = { ...(props.events ?? {}) };
    // The turn-order write's own event is core-internal (PLAN-turn-order
    // §4.1): the recompute must not be able to answer itself, so no genre
    // may list it and no preset can ever bind it. Refused here, at the
    // declaration, where the author is.
    if (sessionEvents.turnOrderChanged in events)
        throw new Error(`${id} lists it in its events: ${TURN_ORDER_CHANGED_IS_INTERNAL}`);
    // A genre lists core's events. A package's event joins a genre's surface
    // through the package entry, which also says who may record it — one
    // place, so a genre cannot list an event with no scope.
    for (const event of Object.keys(events)) {
        if (!eventById(event))
            throw new Error(`${id}: ${notADeclaredEvent(event)}`);
        if (!event.startsWith('core:'))
            throw new Error(`${id} lists '${event}', a package's event — add it to the genre from defineExtension({ events: ` +
                `[{ event, genre, recordedBy }] }), which also says who may record it`);
    }
    // Every genre has the create slot, stated or not — stating it merely
    // confirms; omitting it must not produce a genre nothing can instantiate.
    events[sessionEvents.sessionCreated] = {
        ...(events[sessionEvents.sessionCreated] ?? {}),
        required: true,
    };
    // The envoys (R-18): refused here, at the declaration, on the same terms
    // as the floors — a duplicate key, two defaults or a name with no `en`
    // is an authoring mistake, not a row to degrade.
    // The display text (R-20, U5i): the card's name and subtitle, the shape's
    // fields and panels, and every slot's and sheet's label — refused here on
    // the same terms as the floors. A blank name is a card with no face.
    assertDisplayText(props, id);
    const envoys = assertEnvoys(props.envoys, id, props.shape);
    // The enabled-when defaults (R-15, U5e): refused here on the same terms —
    // a path that is a port reference or a predicate with no reason is an
    // authoring mistake, not a button to grey with no sentence.
    const enabledWhen = assertEnabledWhen(props.enabledWhen, id);
    const { omitWidgets, layouts } = assertGenreWidgets(props, id);
    if (props.customAttributes !== undefined && props.customAttributes !== 'allow' && props.customAttributes !== 'deny')
        throw new Error(`${id}.customAttributes: 'allow' or 'deny' — not ${JSON.stringify(props.customAttributes)}`);
    const playerLabel = assertPlayerLabel(props, id);
    const decl = Object.freeze({
        id,
        name: props.name,
        family: props.family,
        description: props.description,
        shape: props.shape,
        events: Object.freeze(events),
        slots: props.slots ? Object.freeze([...props.slots]) : undefined,
        sheets: props.sheets ? Object.freeze([...props.sheets]) : undefined,
        // Absent unless allowed, so a genre that denies (or says nothing) hashes as it did.
        ...(props.customAttributes === 'allow' ? { customAttributes: 'allow' } : {}),
        ...(envoys.length ? { envoys: Object.freeze(envoys) } : {}),
        // R4: absent when unstated, so a genre that says nothing hashes as it did.
        ...(playerLabel ? { playerLabel } : {}),
        ...(enabledWhen && Object.keys(enabledWhen).length ? { enabledWhen } : {}),
        // The pinned settings (§4.13): copied when stated, frozen like the
        // rest, absent otherwise — so an unpinned genre hashes as it did.
        ...(props.settings && Object.keys(props.settings).length
            ? { settings: Object.freeze({ ...props.settings }) }
            : {}),
        // R71: absent when unstated, so a genre that says nothing hashes as it did.
        ...(omitWidgets.length ? { omitWidgets: Object.freeze(omitWidgets) } : {}),
        ...(layouts.length ? { layouts: Object.freeze(layouts) } : {}),
    });
    const existing = registry.get(id);
    if (existing)
        refuseUnlessIdentical(existing, decl, `duplicate genre id: ${id}`, GENRE_DISPLAY_KEYS);
    registry.set(id, decl);
    return decl;
}
/**
 * Declared genres, by id.
 *
 * ⚠ **Registered, not merely returned**, and the reason is `slots`. A genre
 * carries the attribute slots it brings, and the only party that can answer
 * "does THIS session have health?" is the genre the session was created under —
 * the declarations registry is global, so a reader that walked it would put a
 * health bar on every chat session on the instance, which is the one thing the
 * stats design says a newcomer must never see. A session holds a genre id;
 * this is what turns that id back into the list.
 *
 * Stored as a fact about the running code, like every other registry here: an
 * identical re-declaration is a no-op so a dev-server reload does not throw,
 * and a *different* declaration under a claimed id throws with both hashes
 * named.
 */
const registry = new Map();
/** Display text stripped from the comparison — see `SLOT_DISPLAY_KEYS`. */
const GENRE_DISPLAY_KEYS = { display: ['name', 'description'] };
/** @internal */
export const getGenre = (id) => registry.get(id);
/** @experimental */
export const genres = () => [...registry.values()];
/** @experimental */
export function _clearGenres() {
    registry.clear();
}
/**
 * Register a genre from a package's **stored manifest** — the declaration
 * `genre()` already built and `serene-pub build` serialised, which the host
 * reads back because it never evaluates a plugin's code in-process.
 *
 * Not `genre()`: that is the authoring door and takes values (widget refs,
 * `EnabledWhenDecl`), where a manifest holds their compiled form (widget ids,
 * normalised predicates) — re-running the authoring checks over it would
 * refuse the very shape they produced. What is checked here is what a stored
 * row can still get wrong: the id grammar, the `core:` namespace, and that the
 * owner segment is the declaring package's. A present entry is **replaced**,
 * like a stored slot: the manifest is the one author, and an upgraded package
 * re-registering is that author, not a second party.
 * @internal
 */
export function _registerPackageGenre(packageId, raw) {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    assertGenreId(id);
    if (id.startsWith('core:'))
        throw new Error(`package '${packageId}' may not declare '${id}': the 'core:' namespace is reserved.`);
    if (id.slice(0, id.indexOf(':')) !== packageId)
        throw new Error(`genre '${id}' is not under '${packageId}' — a package declares only its own genres`);
    if (!raw.name || typeof raw.family !== 'string')
        throw new Error(`genre '${id}' has no name or family — not a genre declaration`);
    const events = { ...(raw.events ?? {}) };
    events[sessionEvents.sessionCreated] = { ...(events[sessionEvents.sessionCreated] ?? {}), required: true };
    const decl = Object.freeze({
        ...raw,
        events: Object.freeze(events),
        ...(raw.slots ? { slots: Object.freeze([...raw.slots]) } : {}),
        ...(raw.sheets ? { sheets: Object.freeze([...raw.sheets]) } : {}),
    });
    registry.set(id, decl);
    return decl;
}
/**
 * Withdraw a package's genre, so a disabled or uninstalled plugin's genre stops
 * resolving and an upgraded package may declare it again, differently. The
 * host's to call when it reconciles plugin genres. `core:` genres are never
 * withdrawn: they arrive and leave with the build.
 * @internal
 */
export function _withdrawGenre(id) {
    if (id.startsWith('core:'))
        return false;
    return registry.delete(id);
}
/**
 * The attribute slots a session of this genre carries — its sheets' and its own
 * loose list, as one vocabulary.
 *
 * Sheets first, in the order the genre names them and each in its own order,
 * then whatever the genre lists loose that no sheet already brought. Deduped by
 * id, and the *first* mention is what fixes a slot's position: order here is
 * not decoration — it is what a panel draws, what a state block renders, and
 * what rules run in — so the union preserves it rather than sorting it.
 *
 * An id this build does not declare answers with an empty list rather than
 * with every slot in the registry: an unknown genre is a genre whose vocabulary
 * this install cannot state, and guessing it is how a stat appears where the
 * author never put one. A sheet entry naming a slot this build no longer
 * declares is skipped on the same terms. Values already stored against such a
 * session are untouched — they are read as opaque data, which is the standing
 * "never refuse, fall back and say so" rule for a stale binding.
 * @experimental
 */
export const genreSlots = (id) => {
    const g = registry.get(id);
    if (!g)
        return [];
    const out = [];
    const seen = new Set();
    const take = (decl) => {
        if (!decl || seen.has(decl.id))
            return;
        seen.add(decl.id);
        out.push(decl);
    };
    for (const sheet of g.sheets ?? [])
        for (const entry of sheet.slots)
            take(getAttributeSlot(entry.id));
    for (const decl of g.slots ?? [])
        take(decl);
    return out;
};
/**
 * The sheets a genre brings, by id or by declaration — empty for a genre this
 * build does not declare, on the same "never guess" terms as `genreSlots`.
 *
 * The declarations and not just their slots, because `required`, `default` and
 * the per-slot `config` are what session creation and the panels read, and
 * `genreSlots` has deliberately flattened those away.
 * @internal
 */
export const genreSheets = (g) => (typeof g === 'string' ? registry.get(g)?.sheets : g.sheets) ?? [];
/**
 * The envoys a genre declares, by id — empty for a genre this build does not
 * declare, on the same "never guess" terms as `genreSlots`.
 * @experimental
 */
export const genreEnvoys = (id) => registry.get(id)?.envoys ?? [];
/**
 * The genre's fallback envoy (`EnvoyDecl.fallback`) — the speaker a line
 * nobody claims posts as — or undefined when it declares none.
 * @experimental
 */
export const genreFallbackEnvoy = (g) => (typeof g === 'string' ? registry.get(g)?.envoys : g.envoys)?.find((e) => e.fallback === true);
/** One of a genre's envoys by key, or undefined. @experimental */
export const genreEnvoy = (g, key) => (typeof g === 'string' ? registry.get(g)?.envoys : g.envoys)?.find((e) => e.key === key);
/**
 * The genre's enabled-when default for one function, by id or declaration —
 * empty for a genre this build does not declare or a function it says
 * nothing about, on the same "never guess" terms as `genreSlots`.
 * @internal
 */
export const genreEnabledWhen = (g, fn) => (typeof g === 'string' ? registry.get(g)?.enabledWhen : g.enabledWhen)?.[fn] ?? [];
/** A genre reference as it lands in documents: always the id. Takes a `GenreDecl`, a `use()` ref or an id. @experimental */
export const genreIdOf = (g) => {
    const id = typeof g === 'string' ? g : g.id;
    assertGenreId(id);
    return id;
};
/**
 * The configurable surface of one envoy, as a slot declaration (R-18 (2)).
 *
 * An envoy is not a node and has no registry row to carry a declaration —
 * so the SDK declares its slot from the two facts the genre does carry, its
 * `prompts` defaults and its name, the way `clauseSettingsSlotFor` declares
 * a gather clause's mode. A host renders it through the same reader a node's
 * slot goes through, at the address `envoy:<key>` (`envoyConfigKey`), with
 * the genre's text as the author default: an admin's edit is a deviation
 * above it, and clearing the edit is the genre's text again.
 *
 * `parameters`, not `prompts`, and the reason is what each kind means to a
 * panel: a `prompts` slot is a **reference** to a swappable prompt row, and
 * an envoy's instructions are not a row anybody swaps — they are the genre's
 * words, tuned in place. The slot is still *named* `prompts`, because that
 * is the name the reading node's own slot has and the name `slot.prompts({
 * envoy })` resolves at; the fields are that node's fields.
 * @internal
 */
export function envoyPromptsSlotFor(envoy) {
    return {
        kind: 'parameters',
        facet: 'prompts',
        quick: true,
        description: {
            en: 'The written instructions this envoy speaks under. The genre ships them; edit them here to change how it answers.',
        },
        schema: {
            systemPrompt: {
                type: 'text',
                quick: true,
                default: envoy.prompts?.systemPrompt ?? '',
                label: { en: 'System prompt' },
                description: {
                    en: "Who the envoy is and how it should answer — the reply's instructions, in the envoy's own words.",
                },
            },
            postHistoryInstructions: {
                type: 'text',
                default: envoy.prompts?.postHistoryInstructions ?? '',
                label: { en: 'Post-history instructions' },
                description: {
                    en: 'Instructions placed after the conversation, just before the envoy answers. Empty unless the genre or you put something here.',
                },
            },
        },
    };
}
//# sourceMappingURL=genres.js.map