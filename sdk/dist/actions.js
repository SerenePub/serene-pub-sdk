/**
 * Actions — what a person (or an AI-portrayed participant) can invoke, and
 * where (plans/29 R-15 *venue* · *audience* · *quick* · *slash name*;
 * 09-AMENDMENTS-B B9, F38; ruled 2026-09-15, built 2026-09-16 as U5c).
 *
 * A spec contributes actions through `contributes.actions[]` (was
 * `contributes.triggers[]`, kept one release as a deprecated alias the
 * builder normalises). Core's own message verbs — the floors and the
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
 *   presentation; availability is data (F38). A CSS pack may reposition the
 *   primary set, never remove an action.
 * - **slash** — the stable ASCII id a composer action is called by. Core's
 *   specs claim bare names (`continue`, `narrate`); a plugin's are
 *   `<plugin>.<action>` (`acme.roll`), the plugin id being the spec's
 *   namespace — so a collision across owners is impossible by construction,
 *   and the palette autocompletes so nobody types the long form. Never
 *   localised (R-20): the palette shows the localised `label` beside it.
 *
 * `enabledWhen` is reserved for U5e (a junction-shaped predicate) and is not
 * read by this release.
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
import { envoyFindings } from './genres.js';
/** The two sides of the effects line (R-15). `fiction` is the default. */
export const ACTION_EFFECTS = ['fiction', 'world'];
/** The venues a `world` action may appear in: never a message, the extra tab or a widget. */
export const WORLD_ACTION_VENUES = ['composer', 'session-settings', 'admin', 'review'];
/** The references a `world` action's `act` audience may name: the owner, an administrator. */
export const WORLD_ACTION_ACTORS = ['owner', 'admin'];
/** An action's side of the line: what it declared, else `fiction`. */
export const effectsOf = (action) => action.effects === 'world' ? 'world' : 'fiction';
/** The closed set of places an action may appear. Core owns it; a plugin picks. */
export const VENUE_KINDS = [
    'composer',
    'message',
    'extra',
    'widget',
    'session-settings',
    'pipelines',
    'admin',
    'review',
];
/** A contributed action's default audience: any member sees it, the owner acts. */
export const DEFAULT_ACTION_AUDIENCE = Object.freeze({
    see: ['participant'],
    act: ['owner'],
});
/** A core message verb's audience: whoever the message belongs to (the item rule). */
export const ITEM_AUDIENCE = Object.freeze({
    see: ['participant'],
    act: ['item'],
});
/** A bare slash name — core's and its genres'. */
export const BARE_SLASH = /^[a-z][a-z0-9-]*$/;
/** A plugin's slash name is `<plugin>.<action>`; the plugin id is the spec's namespace. */
export const NAMESPACED_SLASH = /^([a-z0-9]+(?:[.-][a-z0-9]+)*)\.([a-z][a-z0-9-]*)$/;
/** The namespace of a spec id — `core:spec/narrate` → `core`, `acme:spec/roll` → `acme`. */
export function specNamespace(specId) {
    const i = specId.indexOf(':');
    return i === -1 ? '' : specId.slice(0, i);
}
/** Is this namespace core's — the one whose actions take bare slash names? */
export const isCoreNamespace = (ns) => ns === 'core';
/**
 * The slash name an action is called by: the declared one, else derived from
 * the key by the same rule a declared name must obey — `key` for core,
 * `<plugin>.<key>` for a plugin. Always defined, so every composer action is
 * reachable by `/` (F38) whether or not its author named one.
 */
export function slashNameOf(action, specId) {
    if (action.slash)
        return action.slash;
    const ns = specNamespace(specId);
    return isCoreNamespace(ns) || !ns ? action.key : `${ns}.${action.key}`;
}
const KEY = /^[a-z][a-z0-9-]*$/;
/**
 * Every fault in one action declaration, as sentences — the teaching-error
 * pattern (15 §1.3). Empty when the declaration is sound.
 *
 * `specId` decides which slash grammar applies: a `core:` spec may not claim a
 * dotted name and a plugin spec may not claim a bare one, or a name outside its
 * own namespace. That rule is the whole collision guarantee.
 */
export function actionFindings(raw, specId, at = 'contributes.actions') {
    const out = [];
    if (!raw || typeof raw !== 'object')
        return [`${at}: an action is an object — got ${typeof raw}`];
    const a = raw;
    const where = `${at}[${typeof a.key === 'string' ? a.key : '?'}]`;
    if (typeof a.key !== 'string' || !KEY.test(a.key))
        out.push(`${where}: 'key' is required — a lowercase kebab token (${KEY.source})`);
    if (typeof a.function !== 'string' || !a.function)
        out.push(`${where}: 'function' is required — the function key the fire routes (19 §3)`);
    if (typeof a.genre !== 'string' || !a.genre)
        out.push(`${where}: 'genre' is required — the genre id this action is offered to (24 §3), ` +
            `such as core:genre/chat`);
    const venues = Array.isArray(a.venue) ? a.venue : a.venue === undefined ? [] : [a.venue];
    if (!venues.length)
        out.push(`${where}: 'venue' is required — where the action appears (R-15)`);
    for (const v of venues) {
        if (!v || typeof v !== 'object') {
            out.push(`${where}: a venue is { kind, channel? } — got ${typeof v}`);
            continue;
        }
        const kind = v.kind;
        if (!VENUE_KINDS.includes(kind))
            out.push(`${where}: venue kind '${String(kind)}' is not one core offers — ` +
                `one of ${VENUE_KINDS.join(', ')}`);
        const channel = v.channel;
        if (channel !== undefined && (typeof channel !== 'string' || !channel))
            out.push(`${where}: a venue's 'channel' is a channel slug`);
    }
    if (a.audience !== undefined) {
        const aud = a.audience;
        if (!aud || typeof aud !== 'object')
            out.push(`${where}: 'audience' is { see, act }`);
        else
            for (const half of ['see', 'act']) {
                const refs = aud[half];
                if (!Array.isArray(refs))
                    out.push(`${where}: audience.${half} is a list of participant references`);
                else
                    for (const r of refs)
                        if (!isParticipantRef(r))
                            out.push(`${where}: audience.${half} names '${String(r)}', which is not a participant ` +
                                `reference — one of ${PARTICIPANT_ROLES.join(', ')}, or user:<id>, ` +
                                `character:<id>, envoy:<slug>`);
            }
    }
    if (a.quick !== undefined && typeof a.quick !== 'boolean')
        out.push(`${where}: 'quick' is a boolean — the one prominence flag`);
    // The effects line (R-15, F39): a `world` action is owner-only and never
    // in a message venue. Judged on the declared venues and audience, so the
    // sentence names the venue or the reference that crossed it.
    if (a.effects !== undefined && !ACTION_EFFECTS.includes(a.effects))
        out.push(`${where}: 'effects' is one of ${ACTION_EFFECTS.join(', ')} — what the result touches ` +
            `(the effects line, R-15)`);
    if (a.effects === 'world') {
        for (const v of venues) {
            const kind = v?.kind;
            if (typeof kind === 'string' && !WORLD_ACTION_VENUES.includes(kind))
                out.push(`${where}: a 'world' action may not appear in the '${kind}' venue — its result ` +
                    `reaches outside the fiction (cards, lore, settings, permissions), so it belongs ` +
                    `in ${WORLD_ACTION_VENUES.join(', ')} and never where a character could be asked ` +
                    `to answer it (the effects line, R-15)`);
        }
        const act = a.audience?.act;
        if (Array.isArray(act))
            for (const r of act)
                if (!WORLD_ACTION_ACTORS.includes(String(r)))
                    out.push(`${where}: a 'world' action's audience.act names '${String(r)}' — an ` +
                        `out-of-fiction effect is the owner's (or an administrator's) to invoke, ` +
                        `never a participant's or a character's (the effects line, R-15)`);
    }
    if (a.label === undefined)
        out.push(`${where}: 'label' is required — a locale map with 'en'`);
    else
        out.push(...i18nFindings(a.label, `${where}.label`));
    if (a.description !== undefined)
        out.push(...i18nFindings(a.description, `${where}.description`));
    if (a.slash !== undefined) {
        if (typeof a.slash !== 'string')
            out.push(`${where}: 'slash' is a string`);
        else
            out.push(...slashFindings(a.slash, specId, where));
    }
    // The action's envoy (R-18): the same declaration a genre's carries, with
    // one rule of its own — `on-action` only. Judged as an action's, so a
    // `speaks: 'in-turn'` is a sentence here rather than a silent overwrite.
    if (a.envoy !== undefined)
        out.push(...envoyFindings(a.envoy, `${where}.envoy`, 'action'));
    return out;
}
/** The slash-name grammar, applied to one name for one spec. */
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
const i18nFindings = (v, where) => {
    if (typeof v === 'string')
        return [];
    if (v && typeof v === 'object' && typeof v.en === 'string')
        return [];
    return [`${where}: a locale map with a required 'en' (R-20)`];
};
/**
 * The document form of one declaration: a trigger alias folded into an action,
 * `mode` into `genre`, `i18n` into `label`, `venue` into a list. Returns a copy.
 */
export function normalizeAction(raw) {
    const a = { ...raw };
    if (a.mode && !a.genre)
        a.genre = a.mode;
    delete a.mode;
    if (a.i18n !== undefined && a.label === undefined)
        a.label = a.i18n;
    delete a.i18n;
    if (typeof a.venue === 'string')
        a.venue = [{ kind: a.venue }];
    else if (a.venue && !Array.isArray(a.venue))
        a.venue = [a.venue];
    else if (!Array.isArray(a.venue))
        a.venue = [];
    if (typeof a.key !== 'string' && typeof a.function === 'string') {
        // The trigger alias: no key of its own, and its `i18n` was optional —
        // a label is derived so a plugin built against the previous release
        // keeps loading (one release; R-20's enforcement lands with U5i).
        a.key = a.function;
        if (a.label === undefined)
            a.label = { en: a.function };
    }
    // An action's envoy is `on-action` by construction (R-21 (6)): the
    // document form always says so, whether or not the author did.
    if (a.envoy && typeof a.envoy === 'object')
        a.envoy = { ...a.envoy, speaks: 'on-action' };
    return a;
}
/**
 * `contributes` after normalisation: `triggers` folded into `actions`, one
 * release. A document carrying both keeps both lists' entries.
 */
export function normalizeContributes(contributes) {
    if (!contributes)
        return contributes;
    const { triggers, actions, ...rest } = contributes;
    const merged = [...(actions ?? []), ...(triggers ?? [])];
    if (!merged.length)
        return rest;
    return { ...rest, actions: merged.map(normalizeAction) };
}
/**
 * Every action a document contributes, normalised — the `triggers` alias
 * folded in — with the spec id each came from. The one reader hosts use, so
 * the alias is honoured in exactly one place.
 */
export function actionsOf(doc) {
    const c = doc.contributes;
    const normalized = normalizeContributes(c);
    return (normalized?.actions ?? []).map((a) => ({ ...a, specId: doc.id }));
}
/** The spec id core's own verbs are listed under — a name, not a row. */
export const CORE_ACTION_SPEC_ID = 'core';
/**
 * An action's **identity** on the wire: `<spec slug>#<key>` — a spec slug
 * (`core`, `core:spec/narrate`, `acme:spec/roll`; versionless, so no `@`)
 * and a key (a lowercase kebab token), joined by `#`. One string names one
 * declaration; everything that keys on an action keys on this — a preset's
 * included set, a session's enablement row, the fire, a block's `action`,
 * the *new* mark. Never the bare function: several actions, and several
 * specs, may share one. The host's `shared/actions/identity.ts` reads the
 * same grammar from here.
 */
export const ACTION_IDENTITY = /^[a-z0-9:./-]+#[a-z0-9-]+$/;
/** The longest identity the wire accepts; a spec slug is never near this. */
export const ACTION_IDENTITY_MAX_LENGTH = 200;
/**
 * A slash collision: two actions offered to one genre under one name for two
 * different functions. Two specs contributing the **same function** under one
 * name are alternatives the binding selects among (19 §3), not a collision —
 * the name still means one thing.
 *
 * Core's verbs hold their names first (U5c review, S1): every genre the list
 * touches is seeded with `CORE_ACTIONS` under `core`, so a core spec claiming
 * `/retry` for some other function collides with the verb rather than
 * shadowing it in the palette. (A plugin spec cannot claim a bare name at
 * all — that is the grammar's job.)
 *
 * `slashCollisions` is the whole rule; `validate()` applies it inside one
 * document, `announce.build()` inside one package, and the host across every
 * published spec of an install (a boot-time refusal).
 */
export function slashCollisions(actions) {
    const seen = new Map();
    const out = [];
    for (const genre of new Set(actions.map((a) => a.genre ?? '')))
        for (const c of CORE_ACTIONS) {
            const slash = slashNameOf(c, CORE_ACTION_SPEC_ID);
            seen.set(`${genre}#${slash}`, { function: c.function, specId: CORE_ACTION_SPEC_ID, slash });
        }
    for (const a of actions) {
        const slash = slashNameOf(a, a.specId);
        const key = `${a.genre ?? ''}#${slash}`;
        const prior = seen.get(key);
        if (!prior) {
            seen.set(key, { function: a.function, specId: a.specId, slash });
            continue;
        }
        if (prior.function === a.function)
            continue;
        out.push(`'/${slash}' is claimed twice for genre '${a.genre ?? '(none)'}': by '${prior.specId}' ` +
            `for '${prior.function}' and by '${a.specId}' for '${a.function}' — one slash name ` +
            `means one function; rename one of them`);
    }
    return out;
}
/** Every finding on one document's contributed actions, sentences only. */
export function actionDocumentFindings(doc) {
    const c = doc.contributes;
    if (!c)
        return [];
    const raw = [...(c.actions ?? []), ...(c.triggers ?? [])];
    const out = [];
    for (const entry of raw) {
        // Findings are taken on the normalised form so the alias is judged
        // by what it becomes, not by what it lacked.
        const a = normalizeAction(entry);
        out.push(...actionFindings(a, doc.id));
    }
    if (out.length)
        return out;
    return slashCollisions(actionsOf(doc));
}
export const CORE_ACTIONS = Object.freeze([
    {
        key: 'stop',
        function: 'stop',
        venue: [{ kind: 'message' }],
        audience: { see: ['participant'], act: ['participant'] },
        quick: true,
        label: { en: 'Stop generating' },
        icon: 'square',
        floor: true,
    },
    {
        key: 'edit',
        function: 'edit',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        quick: true,
        label: { en: 'Edit' },
        icon: 'pencil',
        floor: true,
    },
    {
        key: 'branch',
        function: 'branch',
        venue: [{ kind: 'message' }],
        audience: { see: ['participant'], act: ['owner'] },
        label: { en: 'Branch from here' },
        icon: 'git-branch',
        floor: true,
    },
    {
        key: 'retry',
        function: 'retry',
        venue: [{ kind: 'message' }, { kind: 'extra' }],
        audience: ITEM_AUDIENCE,
        quick: true,
        slash: 'retry',
        label: { en: 'Regenerate' },
        icon: 'refresh-cw',
        floor: false,
    },
    {
        key: 'continue',
        function: 'continue',
        venue: [{ kind: 'message' }, { kind: 'extra' }],
        audience: ITEM_AUDIENCE,
        slash: 'continue',
        label: { en: 'Continue' },
        icon: 'arrow-down',
        floor: false,
    },
    {
        key: 'swipe',
        function: 'swipe',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Swipe' },
        icon: 'chevrons-left-right',
        floor: false,
    },
    {
        key: 'hide',
        function: 'hide',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Hide' },
        icon: 'ghost',
        floor: false,
    },
    {
        key: 'delete',
        function: 'delete',
        venue: [{ kind: 'message' }],
        audience: ITEM_AUDIENCE,
        label: { en: 'Delete' },
        icon: 'trash-2',
        floor: false,
    },
]);
/** The core action a verb is, or undefined for a verb core does not describe. */
export const coreAction = (key) => CORE_ACTIONS.find((a) => a.key === key);
//# sourceMappingURL=actions.js.map