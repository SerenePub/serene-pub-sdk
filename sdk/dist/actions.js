/**
 * Actions — what a person (or an AI-portrayed participant) can invoke, and
 * where (plans/29 R-15 *venue* · *audience* · *quick* · *slash name*;
 * 09-AMENDMENTS-B B9, F40 — was F38 before the 2026-09-17 renumbering; ruled
 * 2026-09-15, built 2026-09-16 as U5c).
 *
 * A spec contributes actions through `contributes.actions[]`. Core's own message verbs — the floors and the
 * built-ins of U5b — are described by the same shape in `CORE_ACTIONS`, so
 * a client renders **one list** per venue and never hand-writes a verb button.
 *
 * ## The four declarations
 *
 * - **venue** — where the action appears, *per channel*: `{ kind, channel? }`.
 *   `VENUE_KINDS` is a closed set core owns; a plugin picks from it. An
 *   action may name several venues. A venue with no `channel` appears on
 *   every channel of the session.
 * - **audience** — who may *see* and who may *act*, as participant
 *   references (`participants.ts`). Defaults per kind: a contributed action
 *   is seen by any `participant` and acted on by the `owner`
 *   (`DEFAULT_ACTION_AUDIENCE`); a core message verb is `item` — whoever the
 *   message belongs to, decided against the row at the venue.
 * - **quick** — the one prominence flag. Every venue is a **primary set**
 *   (`quick: true`) plus an **overflow** that always lists every enabled
 *   action; composer actions are always reachable through `/`. Placement is
 *   presentation; availability is data (F40). A CSS pack may reposition the
 *   primary set, never remove an action.
 * - **slash** — the stable ASCII id a composer action is called by. Core's
 *   specs claim bare names (`advance`, `narrate`); a plugin's are
 *   `<plugin>.<action>` (`acme.roll`), the plugin id being the spec's
 *   namespace — so a collision across owners is impossible by construction,
 *   and the palette autocompletes so nobody types the long form. Never
 *   localised (R-20): the palette shows the localised `label` beside it.
 *
 * - **enabled-when** (U5e, built 2026-09-17) — whether the action is offered
 *   *now*: a declared predicate over the session's **published values**, the
 *   junction clause's shape (`{ on: 'state.world.location', truthy: true,
 *   reason }`), never code. A list means all must hold. The genre supplies
 *   defaults per function (`GenreDecl.enabledWhen`); a session may override
 *   one function's; the action's own declaration sits between. The panel
 *   renders **why** a button is grey from the failing predicate's `reason`.
 *   The shape and its evaluator live in `predicates.ts`, shared with the
 *   junction clause.
 *
 * ## What this is not
 *
 * Not a *pipeline* — an action *starts* one (`function` is the key routing
 * resolves, 19 §3). Not an *event* — those are core-owned occurrences. Not
 * *availability* — the genre's `messageVerbs` and the preset's included set
 * decide that; a declaration here says where and to whom an available action
 * is offered.
 */
import { isParticipantRef, PARTICIPANT_ROLES } from './participants.js';
import { DEFAULT_CHANNEL, parseChannel } from './channels.js';
import { envoyFindings } from './genres.js';
import { enabledWhenFindings, i18nFindings, isEnabledWhenShaped, normalizeEnabledWhen, } from './predicates.js';
import { i18nText } from './i18n.js';
import { CORE_ACTION_SPEC_ID } from './identity.js';
import { assertSlotId } from './attributes.js';
/** The two sides of the effects line (R-15). `fiction` is the default. @experimental */
export const ACTION_EFFECTS = ['fiction', 'world'];
/**
 * How much an action needs the text it **collects** (lair pass R3,
 * 2026-09-28): `required` — the press does not fire without some;
 * `optional` — an empty submit fires too, and `CollectedText.ifEmpty` says
 * what that does. Was `COMPOSER_TEXT_MODES` (B10), when the text was read
 * off the composer's draft.
 * @experimental
 */
export const TEXT_NEEDS = ['required', 'optional'];
/** The keys `ActionDecl.collects` may carry, and each request's own keys. */
const COLLECTS_KEYS = ['text', 'recipients'];
const COLLECTED_TEXT_KEYS = ['need', 'label', 'placeholder', 'ifEmpty'];
const COLLECTED_RECIPIENTS_KEYS = ['label', 'min', 'max', 'overwrites'];
/**
 * The venues a `world` action may appear in: never a form, the extra tab or a
 * widget.
 *
 * ⚠ **`message` is on the owner's side since 2026-09-28** (lair re-plan R11,
 * *File as a room*). The line exists so that a character can never be asked
 * to answer an out-of-fiction question (29 R-15 *The line*), and a question
 * put to someone lives in the **`form`** venue — split out of `message` the
 * day the line was built (U5d review, S1). The `message` venue is a message's
 * own ⋮ and quick row: a person's button, pressed by the person, on a row.
 * With `act` held to `owner` / `admin` (`WORLD_ACTION_ACTORS`), no block
 * naming it, and no fire made **as** a participant, a `world` action there
 * is the owner acting on a row — the same act as the composer's button,
 * with the row as its subject. `extra` and `widget` stay out: a widget can
 * invoke without a person's press.
 * @experimental
 */
export const WORLD_ACTION_VENUES = ['composer', 'message', 'session-settings', 'admin', 'review'];
/** The references a `world` action's `act` audience may name: the owner, an administrator. @experimental */
export const WORLD_ACTION_ACTORS = ['owner', 'admin'];
/** An action's side of the line: what it declared, else `fiction`. @experimental */
export const effectsOf = (action) => action.effects === 'world' ? 'world' : 'fiction';
/**
 * The closed set of places an action may appear. Core owns it; a plugin picks.
 *
 * `form` (U5d review, S1) is the one venue nothing lists: an action carried
 * by a **form** — a `choices` or `form` block in a message — and pressed
 * only from that block (the Adventure genre's *Answer*). A `form`-venue
 * action never appears in a message's overflow, the composer's More menu or
 * any other listing (`LISTED_VENUE_KINDS`); the block's fire still resolves
 * it. A `world` action may not take it (`WORLD_ACTION_VENUES`): an
 * out-of-fiction effect is never a question a message carries.
 *
 * ⚠ **`form` stays fiction-only even after L1** (ruled 2026-09-17). A block
 * addressed to the **owner** may name a `world` action — see
 * `worldBlockFunctions` — but a *venue* is declared and an *addressee* is
 * decided at run time, so this check cannot see one and would have to admit
 * every `form`-venue world action to admit the owner's. The owner-addressed
 * block therefore names a `composer`-venue world action instead: the venue
 * says where the declaration may be OFFERED, the addressee says who may press
 * this particular button, and the two answers stay separate.
 * @experimental
 */
export const VENUE_KINDS = [
    'composer',
    'message',
    'extra',
    'widget',
    'session-settings',
    'pipelines',
    'admin',
    'review',
    'form',
];
/** The venues a listing offers — every kind but `form`, which only a block reaches. @experimental */
export const LISTED_VENUE_KINDS = VENUE_KINDS.filter((k) => k !== 'form');
/** A contributed action's default audience: any member sees it, the owner acts. @internal */
export const DEFAULT_ACTION_AUDIENCE = Object.freeze({
    see: ['participant'],
    act: ['owner'],
});
/** A core message verb's audience: whoever the message belongs to (the item rule). @experimental */
export const ITEM_AUDIENCE = Object.freeze({
    see: ['participant'],
    act: ['item'],
});
/** A bare slash name — core's and its genres'. @experimental */
export const BARE_SLASH = /^[a-z][a-z0-9-]*$/;
/** A plugin's slash name is `<plugin>.<action>`; the plugin id is the spec's namespace. @experimental */
export const NAMESPACED_SLASH = /^([a-z0-9]+(?:[.-][a-z0-9]+)*)\.([a-z][a-z0-9-]*)$/;
/**
 * Place actions into their venues for one channel — the placement rule every
 * listing applies (F40; R-15 *quick*). `quick` → the primary set, else the
 * overflow; a venue naming another channel's slug is skipped (a bare slug
 * means every lane of it, 20 §7); a `form` venue is listed nowhere — the
 * block alone reaches it (U5d review, S1).
 *
 * Availability is decided BEFORE this: the genre's verbs, the preset's
 * included set and enabled-when say which actions a session offers, and the
 * host's `listSessionActions` decorates each. Pass the offered set and every
 * entry lands in each of its venues exactly once. Pure, so a host can build
 * the conformance kit's `listActions` seam on it — the SDK's own host does
 * — and the kit itself never calls it: C19 judges the listing the HOST
 * returns, entry by entry, and a rule the kit applied for the host would be
 * a rule it could not see the host break (U7 review, C1).
 * @experimental
 */
export function placeActions(actions, channel = DEFAULT_CHANNEL) {
    const listings = {};
    for (const k of LISTED_VENUE_KINDS)
        listings[k] = { primary: [], overflow: [] };
    const slug = parseChannel(channel).slug;
    for (const a of actions)
        for (const v of a.venue) {
            if (v.channel !== undefined && parseChannel(v.channel).slug !== slug)
                continue;
            const bucket = listings[v.kind];
            if (!bucket)
                continue;
            (a.quick === true ? bucket.primary : bucket.overflow).push(a);
        }
    return listings;
}
/** The namespace of a spec id — `core:spec/narrate` → `core`, `acme:spec/roll` → `acme`. @experimental */
export function specNamespace(specId) {
    const i = specId.indexOf(':');
    return i === -1 ? '' : specId.slice(0, i);
}
/** Is this namespace core's — the one whose actions take bare slash names? @experimental */
export const isCoreNamespace = (ns) => ns === 'core';
/**
 * The slash name an action is called by: the declared one, else derived from
 * the key by the same rule a declared name must obey — `key` for core,
 * `<plugin>.<key>` for a plugin. Always defined, so every composer action is
 * reachable by `/` (F40) whether or not its author named one.
 * @experimental
 */
export function slashNameOf(action, specId) {
    if (action.slash)
        return action.slash;
    const ns = specNamespace(specId);
    return isCoreNamespace(ns) || !ns ? action.key : `${ns}.${action.key}`;
}
const KEY = /^[a-z][a-z0-9-]*$/;
/** What a `world` action across the line is told to do instead — one fix for both halves of the declaration. */
const EFFECTS_LINE_FIX = `move the action to a venue on the owner's side of the line (${WORLD_ACTION_VENUES.join(', ')}) ` +
    `and keep audience.act to ${WORLD_ACTION_ACTORS.join(' and/or ')} — or declare effects: 'fiction' ` +
    `if its result stays inside the story`;
/**
 * The effects line at a declaration (R-15 *The line*; F41): a `world` action
 * is owner-only and never in a form, extra or widget venue. Judged one venue or one
 * reference at a time, so the sentence names the venue or the reference
 * that crossed.
 *
 * This is the declaration half of `effectsLineVerdict`'s judge
 * (`messageBlocks.ts`), defined here because `actionFindingsByLaw` — the
 * construction and `validate()` door — sits below that module in the
 * import graph and must not import it. The verdict calls this for a
 * `venue` or `actor` input; the door calls it directly and quotes it.
 * @experimental
 */
export function worldActionCrossing(input) {
    if (input.effects !== 'world')
        return { ok: true };
    if (input.kind === 'venue') {
        const kind = input.venue;
        if (typeof kind !== 'string' || WORLD_ACTION_VENUES.includes(kind))
            return { ok: true };
        return {
            ok: false,
            sentence: `${input.where}: a 'world' action may not appear in the '${kind}' venue — its result ` +
                `reaches outside the fiction (cards, lore, settings, permissions), so it belongs ` +
                `in ${WORLD_ACTION_VENUES.join(', ')} and never where a character could be asked ` +
                `to answer it (the effects line, R-15)`,
            fix: EFFECTS_LINE_FIX,
        };
    }
    if (WORLD_ACTION_ACTORS.includes(String(input.ref)))
        return { ok: true };
    return {
        ok: false,
        sentence: `${input.where}: a 'world' action's audience.act names '${String(input.ref)}' — an ` +
            `out-of-fiction effect is the owner's (or an administrator's) to invoke, ` +
            `never a participant's or a character's (the effects line, R-15)`,
        fix: EFFECTS_LINE_FIX,
    };
}
/**
 * Every fault in one `ActionDecl.collects` (lair pass R3), as sentences: an
 * unknown key, a missing label, an `optional` text with no `ifEmpty`, a
 * `min` below 1 or a `max` below `min`. `where` is the field's address
 * (`contributes.actions[nudge].collects`).
 * @experimental
 */
export function collectsFindings(raw, where) {
    const out = [];
    const unknownKeys = (o, known, at) => {
        for (const k of Object.keys(o))
            if (!known.includes(k))
                out.push(`${at}: '${k}' is not something an action collects here — one of ${known.join(', ')}`);
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return [`${where} is { text?, recipients? } — what the press asks for before it fires`];
    const c = raw;
    unknownKeys(c, COLLECTS_KEYS, where);
    if (c.text !== undefined) {
        const at = `${where}.text`;
        const t = c.text;
        if (!t || typeof t !== 'object' || Array.isArray(t))
            out.push(`${at} is { need, label, placeholder?, ifEmpty? } — the text the modal asks for`);
        else {
            unknownKeys(t, COLLECTED_TEXT_KEYS, at);
            if (!TEXT_NEEDS.includes(t.need))
                out.push(`${at}.need is one of ${TEXT_NEEDS.join(', ')} — whether the press fires ` +
                    `without any text`);
            out.push(...i18nFindings(t.label, `${at}.label`, { required: true }));
            out.push(...i18nFindings(t.placeholder, `${at}.placeholder`));
            if (t.need === 'optional' && t.ifEmpty === undefined)
                out.push(`${at}.ifEmpty is required when need is 'optional' — one sentence saying what an ` +
                    `empty submit does ('The room decides.')`);
            else
                out.push(...i18nFindings(t.ifEmpty, `${at}.ifEmpty`));
        }
    }
    if (c.recipients !== undefined) {
        const at = `${where}.recipients`;
        const r = c.recipients;
        if (!r || typeof r !== 'object' || Array.isArray(r))
            out.push(`${at} is { label, min?, max?, overwrites? } — the cast members the modal asks for`);
        else {
            unknownKeys(r, COLLECTED_RECIPIENTS_KEYS, at);
            out.push(...i18nFindings(r.label, `${at}.label`, { required: true }));
            const count = (v) => typeof v === 'number' && Number.isInteger(v);
            if (r.min !== undefined && (!count(r.min) || r.min < 1))
                out.push(`${at}.min is a whole number, 1 or more — the fewest who may be picked`);
            if (r.max !== undefined) {
                const min = count(r.min) ? r.min : 1;
                if (!count(r.max) || r.max < min)
                    out.push(`${at}.max is a whole number no smaller than min (${min}) — the most who may be picked`);
            }
            if (r.overwrites !== undefined) {
                try {
                    if (typeof r.overwrites !== 'string')
                        throw new Error('not a string');
                    assertSlotId(r.overwrites);
                }
                catch {
                    out.push(`${at}.overwrites is a slot id ('core:slot/whisper@1') — the per-cast slot the action ` +
                        `writes on each recipient`);
                }
            }
        }
    }
    if (c.text === undefined && c.recipients === undefined && !out.length)
        out.push(`${where} collects nothing — declare text, recipients, or leave collects out`);
    return out;
}
/**
 * Every fault in one action declaration, as sentences — the teaching-error
 * pattern (15 §1.3). Empty when the declaration is sound.
 *
 * `specId` decides which slash grammar applies: a `core:` spec may not claim a
 * dotted name and a plugin spec may not claim a bare one, or a name outside its
 * own namespace. That rule is the whole collision guarantee.
 * @experimental
 */
export function actionFindings(raw, specId, at = 'contributes.actions') {
    return actionFindingsByLaw(raw, specId, at).map((f) => f.message);
}
/** `actionFindings`, each sentence with the law it comes from (`ActionFinding`). @experimental */
export function actionFindingsByLaw(raw, specId, at = 'contributes.actions') {
    const out = [];
    /** A fault in the declaration's shape (R-15). */
    const shape = (...messages) => {
        for (const message of messages)
            out.push({ law: 'R-15', message });
    };
    /** A crossing of the effects line (F41) — the verdict's sentence and fix, quoted. */
    const line = (heard) => {
        if (!heard.ok)
            out.push({ law: 'F41', message: i18nText(heard.sentence), fix: i18nText(heard.fix) });
    };
    if (!raw || typeof raw !== 'object')
        return [{ law: 'R-15', message: `${at}: an action is an object — got ${typeof raw}` }];
    const a = raw;
    const where = `${at}[${typeof a.key === 'string' ? a.key : '?'}]`;
    if (typeof a.key !== 'string' || !KEY.test(a.key))
        shape(`${where}: 'key' is required — a lowercase kebab token (${KEY.source})`);
    if (typeof a.genre !== 'string' || !a.genre)
        shape(`${where}: 'genre' is required — the genre id this action is offered to (24 §3), ` +
            `such as core:genre/chat`);
    const venues = Array.isArray(a.venue) ? a.venue : a.venue === undefined ? [] : [a.venue];
    if (!venues.length)
        shape(`${where}: 'venue' is required — where the action appears (R-15)`);
    for (const v of venues) {
        if (!v || typeof v !== 'object') {
            shape(`${where}: a venue is { kind, channel? } — got ${typeof v}`);
            continue;
        }
        const kind = v.kind;
        if (!VENUE_KINDS.includes(kind))
            shape(`${where}: venue kind '${String(kind)}' is not one core offers — ` +
                `one of ${VENUE_KINDS.join(', ')}`);
        const channel = v.channel;
        if (channel !== undefined && (typeof channel !== 'string' || !channel))
            shape(`${where}: a venue's 'channel' is a channel slug`);
    }
    if (a.audience !== undefined) {
        const aud = a.audience;
        if (!aud || typeof aud !== 'object')
            shape(`${where}: 'audience' is { see, act }`);
        else
            for (const half of ['see', 'act']) {
                const refs = aud[half];
                if (!Array.isArray(refs))
                    shape(`${where}: audience.${half} is a list of participant references`);
                else
                    for (const r of refs)
                        if (!isParticipantRef(r))
                            shape(`${where}: audience.${half} names '${String(r)}', which is not a participant ` +
                                `reference — one of ${PARTICIPANT_ROLES.join(', ')}, or user:<id>, ` +
                                `character:<id>, envoy:<slug>`);
            }
    }
    if (a.quick !== undefined && typeof a.quick !== 'boolean')
        shape(`${where}: 'quick' is a boolean — the one prominence flag`);
    // What the press collects (lair pass R3): text and/or recipients, each
    // labelled, in the collect modal. Any venue.
    if (a.collects !== undefined)
        shape(...collectsFindings(a.collects, `${where}.collects`));
    // The effects line (R-15, F41): a `world` action is owner-only and never
    // in a form, extra or widget venue (a row's ⋮ is the owner's, R11). Judged one declared venue and one `act` reference
    // at a time by `worldActionCrossing` — the declaration half of
    // `core:verdict/effects-line` — so the sentence names the venue or the
    // reference that crossed it. An unknown `effects` value is the
    // declaration's shape (R-15); a crossing is F41.
    if (a.effects !== undefined && !ACTION_EFFECTS.includes(a.effects))
        shape(`${where}: 'effects' is one of ${ACTION_EFFECTS.join(', ')} — what the result touches ` +
            `(the effects line, R-15)`);
    for (const v of venues)
        line(worldActionCrossing({
            kind: 'venue',
            where,
            effects: a.effects,
            venue: v?.kind,
        }));
    const act = a.audience?.act;
    if (Array.isArray(act))
        for (const r of act)
            line(worldActionCrossing({ kind: 'actor', where, effects: a.effects, ref: r }));
    shape(...i18nFindings(a.label, `${where}.label`, { required: true }));
    // The legend (2026-09-28): every action says what it does, so the
    // session's legend and the control's tooltip always have a sentence.
    if (a.description === undefined)
        shape(`${where}: 'description' is required — one plain sentence saying what the action does, ` +
            `shown in the session's action legend and as the control's tooltip ` +
            `({ en: 'Roll the dice and post the result.' })`);
    else
        shape(...i18nFindings(a.description, `${where}.description`));
    if (a.iconAlt !== undefined) {
        shape(...i18nFindings(a.iconAlt, `${where}.iconAlt`));
        if (a.icon === undefined)
            shape(`${where}: 'iconAlt' needs an 'icon' — it is what the icon says when it stands alone; ` +
                `drop it, or declare the icon`);
    }
    if (a.slash !== undefined) {
        if (typeof a.slash !== 'string')
            shape(`${where}: 'slash' is a string`);
        else
            shape(...slashFindings(a.slash, specId, where));
    }
    // The action's envoy (R-18): the same declaration a genre's carries, with
    // one rule of its own — `on-action` only. Judged as an action's, so a
    // `speaks: 'in-turn'` is a sentence here rather than a silent overwrite.
    if (a.envoy !== undefined)
        shape(...envoyFindings(a.envoy, `${where}.envoy`, 'action'));
    // Enabled-when (R-15, U5e): the junction rule over published values —
    // a path that is not a port reference, exactly one condition, a reason.
    shape(...enabledWhenFindings(a.enabledWhen, `${where}.enabledWhen`));
    // An `item.*` predicate is answered by the message a press is on: an
    // action with no venue that has one would be judged against nothing.
    const onMessage = venues.some((v) => {
        const kind = v?.kind;
        return kind === 'message' || kind === 'form';
    });
    if (!onMessage)
        normalizeEnabledWhen(a.enabledWhen).forEach((p, i) => {
            if (p.on === 'item' || p.on.startsWith('item.'))
                shape(`${where}.enabledWhen[${i}]: reads '${p.on}', which only a press on a message can ` +
                    `answer — add a { kind: 'message' } venue, or read a session value ` +
                    `('state.world.…', 'session.generating') instead`);
        });
    // Present-when (W-GATE D3): the same grammar, and never `item.*` — a
    // hidden action is hidden from a listing, which has no row to read.
    shape(...enabledWhenFindings(a.presentWhen, `${where}.presentWhen`));
    normalizeEnabledWhen(a.presentWhen).forEach((p, i) => {
        if (p.on === 'item' || p.on.startsWith('item.'))
            shape(`${where}.presentWhen[${i}]: reads '${p.on}' — whether an action is present is ` +
                `decided for a listing, which has no message to read; read a session value ` +
                `('state.world.…', 'session.openForm.action') instead, or grey it per row with ` +
                `enabledWhen`);
    });
    return out;
}
/** The slash-name grammar, applied to one name for one spec. @experimental */
export function slashFindings(slash, specId, where = 'slash') {
    const ns = specNamespace(specId);
    if (isCoreNamespace(ns)) {
        if (BARE_SLASH.test(slash))
            return [];
        return [
            NAMESPACED_SLASH.test(slash)
                ? `${where}: a core spec may not claim the namespaced slash name '/${slash}' — ` +
                    `core's actions take bare names (/${slash.slice(slash.lastIndexOf('.') + 1)})`
                : `${where}: '/${slash}' is not a slash name — lowercase, digits and hyphens, ` +
                    `starting with a letter`,
        ];
    }
    const m = NAMESPACED_SLASH.exec(slash);
    if (!m)
        return [
            BARE_SLASH.test(slash)
                ? `${where}: a plugin spec may not claim the bare slash name '/${slash}' — ` +
                    `third-party actions are '/<plugin>.<action>' (/${ns}.${slash}), so a ` +
                    `collision with core's is impossible`
                : `${where}: '/${slash}' is not a slash name — '<plugin>.<action>', lowercase, ` +
                    `digits and hyphens`,
        ];
    if (m[1] !== ns)
        return [
            `${where}: '/${slash}' claims the namespace '${m[1]}' — a spec under '${ns}' ` +
                `names its actions '/${ns}.<action>'`,
        ];
    return [];
}
/**
 * The document form of one declaration: `venue` as a list. Returns a copy.
 * @experimental
 */
export function normalizeAction(raw) {
    const a = { ...raw };
    if (a.venue && !Array.isArray(a.venue))
        a.venue = [a.venue];
    else if (!Array.isArray(a.venue))
        a.venue = [];
    // An action's envoy is `on-action` by construction (R-21 (6)): the
    // document form always says so, whether or not the author did.
    if (a.envoy && typeof a.envoy === 'object')
        a.envoy = { ...a.envoy, speaks: 'on-action' };
    // Enabled-when in its list form (U5e), `reason` a locale map. Only when
    // it is a predicate or a list of them: anything else is left as written
    // for `actionFindings` to name.
    if (a.enabledWhen !== undefined && a.enabledWhen !== null) {
        const list = Array.isArray(a.enabledWhen) ? a.enabledWhen : [a.enabledWhen];
        if (list.every(isEnabledWhenShaped))
            a.enabledWhen = normalizeEnabledWhen(a.enabledWhen);
    }
    if (a.presentWhen !== undefined && a.presentWhen !== null) {
        const list = Array.isArray(a.presentWhen) ? a.presentWhen : [a.presentWhen];
        if (list.every(isEnabledWhenShaped))
            a.presentWhen = normalizeEnabledWhen(a.presentWhen);
    }
    return a;
}
/**
 * `contributes` after normalisation: every action in its document form.
 * @experimental
 */
export function normalizeContributes(contributes) {
    if (!contributes)
        return contributes;
    const { actions, ...rest } = contributes;
    if (!actions?.length)
        return rest;
    return { ...rest, actions: actions.map(normalizeAction) };
}
/**
 * Every action a document contributes, normalised, with the spec id each
 * came from. The one reader hosts use.
 * @experimental
 */
export function actionsOf(doc) {
    const c = doc.contributes;
    const normalized = normalizeContributes(c);
    return (normalized?.actions ?? []).map((a) => ({ ...a, specId: doc.id }));
}
// The identity grammar lives in `identity.ts` (a leaf, so `genres.ts` can
// hold a default's key to it without a cycle); re-exported here where every
// reader of it has always found it.
export { ACTION_IDENTITY, ACTION_IDENTITY_MAX_LENGTH, CORE_ACTION_SPEC_ID, actionIdentity, isActionIdentity, parseActionIdentity, } from './identity.js';
/**
 * A slash collision: two actions offered to one genre under one name. One
 * slash name means one action (plans/31 V2, ruled 2026-09-17): since the
 * identity `<spec>#<key>` is the only routing key, two specs claiming one
 * name are two actions a palette could not tell apart — a collision, not
 * alternatives. (Until V2 two specs sharing a *function* under one name were
 * alternatives a binding selected among; the function is gone, and so is the
 * exemption.) A plugin's names are namespaced (`acme.roll`), so a plugin
 * declaring the same `key` as a core verb is a different identity under a
 * different name, and never shadows it.
 *
 * Core's verbs hold their names first (U5c review, S1): every genre the list
 * touches is seeded with `CORE_ACTIONS` under `core`, so a core spec claiming
 * `/retry` collides with the verb rather than shadowing it in the palette. (A
 * plugin spec cannot claim a bare name at all — that is the grammar's job.)
 *
 * `slashCollisions` is the whole rule; `validate()` applies it inside one
 * document, `announce.build()` inside one package, and the host across every
 * published spec of an install (a boot-time refusal).
 * @experimental
 */
export function slashCollisions(actions) {
    const seen = new Map();
    const out = [];
    for (const genre of new Set(actions.map((a) => a.genre ?? '')))
        for (const c of CORE_ACTIONS) {
            const slash = slashNameOf(c, CORE_ACTION_SPEC_ID);
            seen.set(`${genre}#${slash}`, {
                identity: `${CORE_ACTION_SPEC_ID}#${c.key}`,
                specId: CORE_ACTION_SPEC_ID,
                key: c.key,
                slash,
            });
        }
    for (const a of actions) {
        const slash = slashNameOf(a, a.specId);
        const identity = `${a.specId}#${a.key}`;
        const key = `${a.genre ?? ''}#${slash}`;
        const prior = seen.get(key);
        if (!prior) {
            seen.set(key, { identity, specId: a.specId, key: a.key, slash });
            continue;
        }
        // The same declaration met twice (a document listed on two roads) is
        // one action, not two.
        if (prior.identity === identity)
            continue;
        out.push(`'/${slash}' is claimed twice for genre '${a.genre ?? '(none)'}': by '${prior.specId}' ` +
            `for '${prior.key}' and by '${a.specId}' for '${a.key}' — one slash name ` +
            `means one action; rename one of them`);
    }
    return out;
}
/** Every finding on one document's contributed actions, sentences only. @internal */
export function actionDocumentFindings(doc) {
    return actionDocumentFindingsByLaw(doc).map((f) => f.message);
}
/**
 * `actionDocumentFindings` with the law each sentence comes from — what
 * `validate()` labels its findings by. A slash collision is R-15's.
 * @experimental
 */
export function actionDocumentFindingsByLaw(doc) {
    const c = doc.contributes;
    if (!c)
        return [];
    const out = [];
    for (const entry of c.actions ?? []) {
        const a = normalizeAction(entry);
        out.push(...actionFindingsByLaw(a, doc.id));
    }
    if (out.length)
        return out;
    return slashCollisions(actionsOf(doc)).map((message) => ({ law: 'R-15', message }));
}
/**
 * The sentences beside a grey core verb, as locale maps — the `reason` of
 * each verb's enabled-when below (U5e). One vocabulary: the host's chips,
 * menus and palette read these through the verdict, and a refusal at the
 * door says the same words. The two conditions that are NOT published
 * values — an edit in progress, the audience — keep their sentences on the
 * client (`messageVerbState.ts`).
 * @internal
 */
export const CORE_VERB_REASONS = Object.freeze({
    generating: { en: 'wait for the reply to finish' },
    hidden: { en: 'unhide it first' },
    notNewest: { en: 'only the newest reply can be regenerated' },
    noSwipe: { en: 'nothing to swipe to' },
    greeting: { en: 'a greeting is swiped, not regenerated' },
    ownLine: { en: 'your own line is edited, not regenerated' },
    nobodySeated: { en: 'nobody is seated to pick' },
});
/** Nothing in the session is generating — the busy rule every verb but stop shares. */
const NOT_GENERATING = {
    on: 'session.generating',
    equals: false,
    reason: CORE_VERB_REASONS.generating,
};
/** The row is the newest on its channel — retry, extend and swipe act on the newest reply only. */
const NEWEST = { on: 'item.isNewest', truthy: true, reason: CORE_VERB_REASONS.notNewest };
/**
 * The row is a reply — retry, extend and swipe write a reply over the row,
 * so on the author's own line (`role: 'user'`) they would overwrite what the
 * author wrote with the narrator's prose (F1, every persona-less genre). Keyed
 * on the role, never on a persona: a persona-less author line has none.
 */
const REPLY = { on: 'item.role', equals: 'assistant', reason: CORE_VERB_REASONS.ownLine };
/** @internal */
export const CORE_ACTIONS = Object.freeze([
    {
        key: 'stop',
        venue: [{ kind: 'message' }],
        audience: { see: ['participant'], act: ['participant'] },
        quick: true,
        label: { en: 'Stop generating' },
        description: { en: 'Stop the reply being written now; what it wrote so far is kept.' },
        icon: 'square',
        floor: true,
    },
    {
        key: 'edit',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        quick: true,
        label: { en: 'Edit' },
        description: { en: 'Change the text of this message.' },
        icon: 'pencil',
        enabledWhen: [
            { on: 'item.hidden', equals: false, reason: CORE_VERB_REASONS.hidden },
            NOT_GENERATING,
        ],
        floor: true,
    },
    {
        key: 'branch',
        venue: [{ kind: 'message' }],
        audience: { see: ['participant'], act: ['owner'] },
        label: { en: 'Branch from here' },
        description: { en: 'Start a copy of the session from this message, leaving this one as it is.' },
        icon: 'git-branch',
        enabledWhen: [NOT_GENERATING],
        floor: true,
    },
    {
        key: 'retry',
        venue: [{ kind: 'message' }, { kind: 'extra' }],
        audience: ITEM_AUDIENCE,
        quick: true,
        slash: 'retry',
        label: { en: 'Regenerate' },
        description: { en: 'Write the newest reply again, in place of the one there.' },
        icon: 'refresh-cw',
        enabledWhen: [
            NEWEST,
            REPLY,
            { on: 'item.greeting', equals: false, reason: CORE_VERB_REASONS.greeting },
            { on: 'item.hidden', equals: false, reason: CORE_VERB_REASONS.hidden },
            NOT_GENERATING,
        ],
        floor: false,
    },
    {
        // The prefill extend: carry this reply on (ruling 2026-09-08; renamed
        // from `continue` 2026-09-28). A message verb only — the composer's
        // Continue is `advance` below.
        key: 'extend',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Extend' },
        description: { en: 'Carry on writing this reply from where it stopped.' },
        icon: 'arrow-down',
        enabledWhen: [NEWEST, REPLY, NOT_GENERATING],
        floor: false,
    },
    {
        // The composer's Continue (lair pass B7): fire the turn order's head.
        // A turn control, not a message verb — no row, so no `item.*`
        // predicate; who may fire which entry is the fire's own rule.
        key: 'advance',
        venue: [{ kind: 'extra' }],
        audience: { see: ['participant'], act: ['participant'] },
        slash: 'advance',
        label: { en: 'Continue' },
        description: { en: 'Let whoever is next in the turn order speak.' },
        icon: 'message-square-more',
        enabledWhen: [NOT_GENERATING],
        floor: false,
    },
    {
        // Pick who speaks (lair pass B8): fire a character the person names.
        // A turn control — present where the genre's `turnControls.pick`
        // says it applies; greyed here while busy or with nobody to pick.
        key: 'pick',
        venue: [{ kind: 'extra' }],
        audience: { see: ['participant'], act: ['participant'] },
        // Not `/pick`: too plain a word to take from every plugin's palette.
        slash: 'pick-speaker',
        label: { en: 'Pick who speaks' },
        description: { en: 'Choose which character speaks next.' },
        icon: 'message-square-plus',
        enabledWhen: [
            NOT_GENERATING,
            { on: 'state.who.active', truthy: true, reason: CORE_VERB_REASONS.nobodySeated },
        ],
        floor: false,
    },
    {
        // The genre's own voice narrates (lair pass B8, D3; R8): fire it with
        // no new direction — Adventure's narrator, the Lair's Castellan (the
        // host stamps the fire `via: 'narrate'`). Opt-in — only a `voice:
        // 'narrator'` genre has one (`turnControls.narrate`). The owner's, as
        // a pick out of order is.
        key: 'narrate',
        venue: [{ kind: 'extra' }],
        audience: { see: ['participant'], act: ['owner'] },
        // Not `/narrate`: Chat's narrate spec claims that name, and one
        // slash name means one action (`slashCollisions`).
        slash: 'narrator',
        label: { en: 'Narrate' },
        // Voice-neutral (lair pass R8, 2026-09-28): whose voice narrates is
        // the genre's — Adventure's narrator, the Lair's Castellan.
        description: { en: 'Describe what happens next, with no new direction.' },
        icon: 'cloud-sun',
        enabledWhen: [NOT_GENERATING],
        floor: false,
    },
    {
        // Regenerate the last turn, as a whole (lair pass R2, owner
        // 2026-09-28): delete the newest turn's yield — every row its run
        // created, on every channel, never a person's own line — and take
        // the same turn again. Opt-in (`turnControls.retake`), for a genre
        // whose turn writes more than one row; where it is offered, `retry`
        // leaves the extra venue so one genre never shows two _Regenerate_
        // chips. The owner's: it deletes what everybody at the table saw.
        key: 'retake',
        venue: [{ kind: 'extra' }],
        audience: { see: ['participant'], act: ['owner'] },
        slash: 'retake',
        label: { en: 'Regenerate' },
        description: {
            en: "Delete the last turn's messages and take the same turn again. Your own lines stay.",
        },
        icon: 'refresh-cw',
        enabledWhen: [NOT_GENERATING],
        floor: false,
    },
    {
        key: 'swipe',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Swipe' },
        description: { en: 'Step between the other versions of this reply.' },
        icon: 'chevrons-left-right',
        enabledWhen: [
            NEWEST,
            REPLY,
            { on: 'item.hasSwipes', truthy: true, reason: CORE_VERB_REASONS.noSwipe },
            NOT_GENERATING,
        ],
        floor: false,
    },
    {
        key: 'hide',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Hide' },
        description: { en: 'Leave this message out of what the characters remember; it stays on the page.' },
        icon: 'ghost',
        enabledWhen: [NOT_GENERATING],
        floor: false,
    },
    {
        key: 'delete',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Delete' },
        description: { en: 'Remove this message from the session.' },
        icon: 'trash-2',
        enabledWhen: [NOT_GENERATING],
        floor: false,
    },
]);
/** The core action a verb is, or undefined for a verb core does not describe. @internal */
export const coreAction = (key) => CORE_ACTIONS.find((a) => a.key === key);
//# sourceMappingURL=actions.js.map