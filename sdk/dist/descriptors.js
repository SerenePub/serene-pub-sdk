/**
 * Descriptors — the shared-scope declaration of a **node definition** (01 §1, 04 §3;
 * NOMENCLATURE §5 — *node type* is retired, ruled 2026-09-14).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the handler that implements it. That is what lets the plugin manager and the
 * editor work from rows (10 §10.2).
 */
import { pluginRuleRef } from './pluginRuleRef.js';
import { checkBandDeclarations } from './bands.js';
import { settingsSchemaFindings } from './settings.js';
import { i18nFindings, isI18n, localeMapOf } from './i18n.js';
import { eventById, notADeclaredEvent } from './events.js';
import { enabledWhenFindings, evaluateEnabledWhen, normalizeEnabledWhen, } from './predicates.js';
import { widgetReadsFindings } from './widgetDecls.js';
import { contentHash, declarationData, refuseUnlessSameHash } from './hash.js';
// The substrate's `settings` slot is projected onto a registry row beside the
// author's; the contract material leaves it out by name (`authoredSlots`).
// `settingsSlot.ts` imports nothing from here at runtime, so no cycle.
import { authoredSlots } from './settingsSlot.js';
import { DEFAULT_CHANNEL, parseChannel } from './channels.js';
// F39's registry door: `register()` hears `core:verdict/settings-travel` for
// every declared out-port (01 §13). `verdicts.ts` reads only leaf
// vocabulary, so this import starts no cycle.
import { refusalText, settingsTravelVerdict } from './verdicts.js';
export { fieldLabel, fieldAccepts } from './settings.js';
/**
 * A definition's interior points, as copies — the one reader of
 * `scriptPoints` (the executor's broker and the registry projection both go
 * through it), so a caller may not edit the declaration through it.
 * @experimental
 */
export function scriptPointsOf(d) {
    return (d.scriptPoints ?? []).map((p) => ({
        ...p,
        key: String(p.key),
        accepts: Array.isArray(p.accepts) ? [...p.accepts] : [],
    }));
}
/**
 * The message verbs no genre may remove (R-15, ruled 2026-09-15): a person
 * can always stop a reply, branch a session and rewrite a line. Not keys of
 * `SessionShape.messageVerbs`; a declaration naming one `false` is refused
 * at registration (`assertMessageVerbFloors`).
 * @experimental
 */
export const MESSAGE_VERB_FLOORS = ['stop', 'branch', 'edit'];
/**
 * The opt-in built-ins: core's writes a genre may switch off and never
 * re-implement. Default on.
 * @experimental
 */
export const MESSAGE_VERB_BUILT_INS = ['delete', 'hide', 'swipe'];
/** The genre-declared content actions — built-in write + declared content. @experimental */
export const MESSAGE_VERB_CONTENT = ['retry', 'extend', 'stepBack'];
/** Every forbiddable verb, in the order the availability map reads them. @experimental */
export const MESSAGE_VERBS = [...MESSAGE_VERB_CONTENT, ...MESSAGE_VERB_BUILT_INS];
/**
 * The turn controls (lair pass B7 + B8, 2026-09-27) — the composer's presses
 * that move the story on, as opposed to the message verbs, which act on one
 * row. Keys of `SessionShape.turnControls`, in the order the extra venue
 * draws them.
 *
 * - `advance` is **Continue**: it fires the turn order's head
 *   (`sessions:fireTurn` with no entry). ⚠ Not `extend` — that is the
 *   message verb that extends one reply by prefill (`messageVerbs.extend`).
 * - `pick` is **Pick who speaks**: it fires a character the person names
 *   (`sessions:fireTurn` with a `character:<id>` entry the order does not
 *   hold).
 * - `narrate` fires a **narrator turn** (`sessions:fireTurn` with a `null`
 *   ref the order does not hold) — only a `voice: 'narrator'` genre has a
 *   narrator to fire (`turnControlDefault`).
 * - `retake` is **Regenerate the last turn, as a whole** (lair pass R2,
 *   owner 2026-09-28; label _Regenerate_, `sessions:retakeTurn`): it
 *   deletes the newest turn's **turn yield** — every row that turn's run
 *   created, on every channel, never a person's own line — and takes the
 *   same turn again. ⚠ Not `retry`, the message verb that rewrites ONE
 *   reply in place and keeps its swipes. Offered only where a genre
 *   declares it (`turnControlDefault`): a genre whose turn writes one row
 *   keeps `retry`.
 * @experimental
 */
export const TURN_CONTROLS = ['advance', 'pick', 'narrate', 'retake'];
/**
 * What an undeclared turn control resolves to — read off the shape's own
 * declarations, so a genre that says nothing keeps what its shape already
 * means (R42: turn controls only where there is somebody to take a turn):
 *
 * - `advance` and `pick` are on where the shape has a **character system**
 *   (`characters` declared with a `max` other than 0; an unreadable shape
 *   counts as having one) — the composer's historical rule.
 * - `narrate` is on where the shape has a **narrator** (`voice:
 *   'narrator'`), the one genre family with a narrator to fire.
 * - `retake` is never on by default: nothing in a shape says a turn writes
 *   more than one row, so a genre opts in (`turnControls.retake: true`).
 * @experimental
 */
export function turnControlDefault(shape, control) {
    const s = shape && typeof shape === 'object' ? shape : null;
    if (control === 'retake')
        return false;
    if (control === 'narrate')
        return s?.voice === 'narrator';
    if (!s)
        return true;
    const characters = s.characters;
    return !!characters && typeof characters === 'object' && (characters.max ?? 1) !== 0;
}
/**
 * What turn controls this shape offers, resolved — the `resolveWrites`
 * posture: an undeclared or unreadable control is the shape's default
 * (`turnControlDefault`), `false` takes it away, `true` or an object offers it. Pure, and
 * takes `unknown` for a stored shape.
 *
 * With a `channel` (a slug or `slug:lane`; lair re-plan R6), that channel's
 * declared `ChannelDecl.turnControls` win over the genre's, key by key — the
 * `messageVerbs` merge. A channel the shape does not declare in the long
 * form answers the genre's policy.
 * @experimental
 */
export function resolveTurnControls(shape, channel) {
    const declared = shape && typeof shape === 'object'
        ? (shape.turnControls ?? null)
        : null;
    const genre = plainObject(declared) ?? {};
    const own = channel === undefined ? undefined : channelTurnControlsOf(shape, channel);
    const d = own ? { ...genre, ...own } : genre;
    return Object.fromEntries(TURN_CONTROLS.map((t) => {
        const v = d[t];
        if (v === true || v === false)
            return [t, { offered: v, presentWhen: [] }];
        if (v && typeof v === 'object' && !Array.isArray(v))
            return [
                t,
                {
                    offered: true,
                    presentWhen: normalizeEnabledWhen(v.presentWhen),
                },
            ];
        return [t, { offered: turnControlDefault(shape, t), presentWhen: [] }];
    }));
}
/** A plain object, else undefined — how a stored declaration's map is read. */
function plainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
}
/** One declared channel's own `turnControls`, by slug (the lane is multiplicity). */
function channelTurnControlsOf(shape, channel) {
    const channels = plainObject(shape)?.channels;
    if (!Array.isArray(channels))
        return undefined;
    const slug = parseChannel(channel).slug;
    for (const raw of channels) {
        const decl = plainObject(raw);
        if (decl && typeof decl.slug === 'string' && parseChannel(decl.slug).slug === slug)
            return plainObject(decl.turnControls);
    }
    return undefined;
}
/**
 * Is this turn control present over these published values — offered, and
 * every present-when holds? The failing predicate's reason when not; `null`
 * reason for a control the genre does not offer at all.
 * @experimental
 */
export function turnControlPresent(policy, control, values) {
    const p = policy[control];
    if (!p.offered)
        return { present: false, reason: null };
    const verdict = evaluateEnabledWhen(p.presentWhen, values);
    return verdict.enabled ? { present: true } : { present: false, reason: verdict.reason };
}
/**
 * A `turnControls` declaration's faults, refused at the declaration: an
 * unknown control, a value that is neither a boolean nor `{ presentWhen }`,
 * a present-when the enabled-when grammar refuses, or a present-when over
 * `item.*` (a turn control acts on no row).
 * @experimental
 */
export function assertTurnControls(shape, who) {
    const raw = shape?.turnControls;
    if (raw === undefined)
        return;
    const problems = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        problems.push(`turnControls is { ${TURN_CONTROLS.map((t) => `${t}?`).join(', ')} }`);
    }
    else {
        for (const [k, v] of Object.entries(raw)) {
            if (!TURN_CONTROLS.includes(k)) {
                problems.push(`turnControls.${k}: not a turn control — one of ${TURN_CONTROLS.join(', ')}`);
                continue;
            }
            if (typeof v === 'boolean')
                continue;
            if (!v || typeof v !== 'object' || Array.isArray(v) || !('presentWhen' in v)) {
                problems.push(`turnControls.${k}: true, false, or { presentWhen } — enabled-when predicates ` +
                    `over the published values, such as { on: 'session.fields.<field>', ` +
                    `equals: '<value>', reason: { en: '<why it is absent>' } }`);
                continue;
            }
            const pw = v.presentWhen;
            problems.push(...enabledWhenFindings(pw, `turnControls.${k}.presentWhen`));
            normalizeEnabledWhen(pw).forEach((p, i) => {
                if (p.on === 'item' || p.on.startsWith('item.'))
                    problems.push(`turnControls.${k}.presentWhen[${i}]: reads '${p.on}' — a turn control acts ` +
                        `on no row, so it cannot read one`);
            });
        }
    }
    if (problems.length)
        throw new Error(`${who}: ${problems.join('\n')}`);
}
/**
 * The writes a genre may switch off (R-B, 2026-09-17) — what a session does
 * *beyond messages*. Keys of `SessionShape.writes`, in the order a policy
 * reads them.
 * @experimental
 */
export const SESSION_WRITES = ['lore', 'scenes'];
/**
 * What this shape lets a session write, resolved. Absent, unknown or
 * unreadable is **both on** — the standard chat's posture, and the same
 * "a policy that cannot be read refuses nothing" rule `messageVerbs` keeps.
 * Only an explicit `false` takes a write away.
 *
 * Pure, and takes `unknown` on purpose: the app reads a shape that arrived
 * from a stored registry row, not a typed declaration.
 * @experimental
 */
export function resolveWrites(shape) {
    const declared = shape && typeof shape === 'object'
        ? (shape.writes ?? null)
        : null;
    if (!declared || typeof declared !== 'object')
        return Object.fromEntries(SESSION_WRITES.map((w) => [w, true]));
    const d = declared;
    return Object.fromEntries(SESSION_WRITES.map((w) => [w, d[w] !== false]));
}
/**
 * A `writes` declaration whose values are not booleans is refused — with a
 * sentence, at the declaration, where the author is. Shared by `register`
 * (an inlet's `sessionShape`) and `genre()` (a genre's `shape`), on the same
 * terms as `assertMessageVerbFloors`. Unknown keys are ignored, as the
 * resolver ignores them: a key this release does not know is not a write.
 * @experimental
 */
export function assertSessionWrites(shape, who) {
    const writes = shape?.writes;
    if (writes === undefined)
        return;
    if (!writes || typeof writes !== 'object' || Array.isArray(writes))
        throw new Error(`${who} declares a 'writes' that is not an object. A genre's writes are ` +
            `{ lore?: boolean; scenes?: boolean } — absent means both on, and only an ` +
            `explicit false takes one away (R-B).`);
    const bad = SESSION_WRITES.filter((w) => writes[w] !== undefined && typeof writes[w] !== 'boolean');
    if (!bad.length)
        return;
    throw new Error(`${who} declares writes { ${bad.map((w) => `${w}: ${JSON.stringify(writes[w])}`).join(', ')} }. ` +
        `Each write is a boolean or absent — absent means on, and only an explicit ` +
        `false takes the write away (R-B).`);
}
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
 * @internal
 */
export const BUILTIN_SPEC_IDS = Object.freeze({
    delete: 'core:spec/builtin-delete',
    hide: 'core:spec/builtin-hide',
    edit: 'core:spec/builtin-edit',
    swipe: 'core:spec/builtin-swipe',
    branch: 'core:spec/builtin-branch',
});
/** The outlet each built-in's spec ends in — `effects: 'write'`, every one. @experimental */
export const BUILTIN_OUTLET_IDS = Object.freeze({
    delete: 'core:outlet/delete-message@1',
    hide: 'core:outlet/hide-message@1',
    edit: 'core:outlet/edit-message@1',
    swipe: 'core:outlet/swipe-message@1',
    branch: 'core:outlet/branch-session@1',
});
/** Is this definition id one of the five built-in write outlets? @experimental */
export const isBuiltInOutlet = (definitionId) => Object.values(BUILTIN_OUTLET_IDS).includes(definitionId);
/** Is this spec id one of the five built-in specs — the only documents that may place a built-in outlet? @internal */
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
 * @internal
 */
export const FORM_ADDRESSED_INLET_ID = 'core:inlet/form-addressed@1';
/** @experimental */
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
 * @experimental
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
 * @experimental
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
 * @experimental
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
        `extend or stepBack; drop the floor from the declaration.`);
}
/** The roles a channel's messages may play in a prompt. @experimental */
export const CHANNEL_ROLES = ['conversation', 'folio'];
/** The voices a channel's turn may seed under. `none` seeds no row at all. @experimental */
export const CHANNEL_VOICES = ['character', 'narrator', 'none'];
/**
 * This shape's channels as full declarations, defaults resolved — the one
 * reader every consumer of `SessionShape.channels` should use, so the short
 * and long forms cannot be read differently anywhere.
 *
 * `main` comes first and always exists, declared or not: it is the session's
 * default channel, so a genre that lists only `manuscript` still has it. A
 * genre that *does* declare `main` gets its own declaration in that first
 * position rather than a second row.
 *
 * What "resolved" means, per entry: `role` is always present; `voice` is the
 * channel's, else the genre's, else absent; `messageVerbs` is the genre's
 * with the channel's declared keys over the top, absent when neither declares
 * any; `turnControls` the same, over the genre's `turnControls`; `label` a
 * locale map, absent when undeclared. So the answer read off an entry is the
 * effective one, and no caller has to remember the inheritance.
 *
 * Takes `unknown` for the same reason `resolveWrites` does, and never throws:
 * a shape from a stored registry row is data. An unreadable entry is skipped
 * rather than guessed at — the refusal belongs at the declaration
 * (`assertChannelDecls`), not at a read on the turn's path.
 * @experimental
 */
export function channelDecls(shape) {
    const s = (shape && typeof shape === 'object' ? shape : {});
    const genreVoice = typeof s.voice === 'string' ? s.voice : undefined;
    const genreVerbs = s.messageVerbs;
    const genreControls = plainObject(s.turnControls);
    const resolve = (raw) => {
        const decl = typeof raw === 'string'
            ? { slug: raw.trim() }
            : raw && typeof raw === 'object' && !Array.isArray(raw)
                ? raw
                : {};
        const slug = typeof decl.slug === 'string' ? decl.slug.trim() : '';
        if (!slug)
            return undefined;
        const verbs = decl.messageVerbs || genreVerbs ? { ...genreVerbs, ...decl.messageVerbs } : undefined;
        const ownControls = plainObject(decl.turnControls);
        const controls = ownControls || genreControls ? { ...genreControls, ...ownControls } : undefined;
        return {
            slug,
            role: decl.role ?? 'conversation',
            ...(decl.voice ?? genreVoice ? { voice: decl.voice ?? genreVoice } : {}),
            ...(verbs ? { messageVerbs: verbs } : {}),
            ...(isI18n(decl.label) ? { label: localeMapOf(decl.label) } : {}),
            ...(controls ? { turnControls: controls } : {}),
        };
    };
    const declared = (Array.isArray(s.channels) ? s.channels : [])
        .map(resolve)
        .filter((d) => d !== undefined);
    const main = declared.find((d) => d.slug === DEFAULT_CHANNEL);
    return [main ?? resolve(DEFAULT_CHANNEL), ...declared.filter((d) => d !== main)];
}
/**
 * A channel declaration that cannot mean what it says is refused — with a
 * sentence, at the declaration, on the same terms as `assertMessageVerbFloors`.
 *
 * `main` may only be a conversation: it is the channel every session has and
 * the one a turn lands on by default, so a genre that made it a document
 * would leave the session with nowhere to talk.
 * @experimental
 */
export function assertChannelDecls(shape, who) {
    const channels = shape?.channels;
    if (channels === undefined)
        return;
    if (!Array.isArray(channels))
        throw new Error(`${who} declares a 'channels' that is not an array. A genre's channels are a list ` +
            `of slugs, each a bare string or a { slug, role?, voice?, messageVerbs?, label?, turnControls? } (R-C).`);
    for (const raw of channels) {
        const isString = typeof raw === 'string';
        if (!isString && (!raw || typeof raw !== 'object' || Array.isArray(raw)))
            throw new Error(`${who} declares a channel that is neither a slug nor a declaration: ` +
                `${JSON.stringify(raw)}. Each channel is a bare string or a ` +
                `{ slug, role?, voice?, messageVerbs?, label?, turnControls? } (R-C).`);
        const decl = (isString ? { slug: raw } : raw);
        const slug = typeof decl.slug === 'string' ? decl.slug.trim() : '';
        if (!slug)
            throw new Error(`${who} declares a channel with no slug. A channel is named by the slug it is ` +
                `referenced and stored under (R-C).`);
        if (slug.includes(':'))
            throw new Error(`${who} declares the channel '${slug}'. A channel is declared by its slug alone — ` +
                `lanes under it are runtime and open-ended, allocated by this genre's ` +
                `pipelines, and no lane count is declared anywhere (ruling 2026-09-09).`);
        const at = `${who} channel '${slug}'`;
        if (decl.role !== undefined && !CHANNEL_ROLES.includes(decl.role))
            throw new Error(`${at} declares role '${decl.role}'. A channel's role is ` +
                `${CHANNEL_ROLES.map((r) => `'${r}'`).join(' or ')} — how its messages enter a ` +
                `prompt, turns with speakers or one block of text (R-C).`);
        if (decl.voice !== undefined && !CHANNEL_VOICES.includes(decl.voice))
            throw new Error(`${at} declares voice '${decl.voice}'. A channel's voice is ` +
                `${CHANNEL_VOICES.map((v) => `'${v}'`).join(', ')} — whose name a turn ` +
                `triggered here seeds under, or none for no seed row at all (R-C).`);
        assertMessageVerbFloors({ messageVerbs: decl.messageVerbs }, at);
        // R6: the display name is display text, and the per-channel turn
        // controls are judged on exactly the terms the genre's are.
        const label = i18nFindings(decl.label, `${at} label`);
        if (label.length)
            throw new Error(label.join('\n'));
        assertTurnControls({ turnControls: decl.turnControls }, at);
        if (slug === DEFAULT_CHANNEL && (decl.role ?? 'conversation') !== 'conversation')
            throw new Error(`${at} is declared role '${decl.role}'. '${DEFAULT_CHANNEL}' is the channel every ` +
                `session has and the one a turn lands on by default, so it is always a ` +
                `conversation; declare another channel for the folio (R-C).`);
    }
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
 * ⚠ `title` is deliberately absent. `WidgetDecl.title` is a heading, but
 * `EntryRoles.title` is which field the engine reads as a row's title —
 * contract, and moving one is an `@N+1` on purpose. One word, two answers, both
 * reachable from here, so a key-name rule cannot have it both ways; the panel
 * heading stays hashed until one of them is renamed.
 *
 * ## Where it is read
 *
 * Inside `definitionContract`, on every contract field that can carry a
 * label — `slots`, `scriptPoints`, `sessionShape`, `entryShape`. The
 * re-declaration guard below and core's `pipeline_definition_registry`
 * projection both hash through that one function, so there is no second list
 * to keep in step; the value is exported for the tests that prove the strip
 * holds at every depth. Adding a word here re-hashes every definition that
 * carries it — a pointer move on every install, exactly as adding one to
 * `UNIVERSAL_DISPLAY` would be.
 * @internal
 */
export const DESCRIPTOR_DISPLAY_KEYS = { display: ['label'] };
/**
 * The two halves of a `Descriptor` (plans/31 V6, ruled 2026-09-17).
 *
 * **Contract** is what a pinned spec runs against: the ports and shapes a
 * document was compiled against, the slots it configures and their schema,
 * the effects the gate keys on, the fields a reviewer's decision may carry,
 * whether the node may fail empty, return early, draw on the seed, hold the
 * live row, cause an event, take media. It is what `definitionContractHash`
 * digests, and that hash is what a registry row's pointer and a run's receipt
 * name — so moving any of it republishes the slug on every install.
 *
 * **Policy** is what is *offered* or *shown*: whether the definition is
 * listed (`provisional`, `public`), where its gate starts, whether the panel
 * offers a switch, how long the host waits, what the receipt reads, what the
 * node is called. It lives on the registry row (`RegistryEntry.policy`,
 * `i18n`, `public`) and is never hashed: flipping any of it leaves every pin
 * where it is and takes effect on the next sync — and on the next hot reload,
 * since the registry replaces a re-declaration whose contract is unchanged.
 *
 * Every `Descriptor` key is in exactly one list. `DescriptorFieldsClassified`
 * below makes a key in neither — or in both — a compile error, so a new field
 * is classified before it exists; `sdk-tests/contract.test.ts` gives the
 * one-line reason per field.
 * @experimental
 */
export const DESCRIPTOR_CONTRACT_KEYS = [
    'id',
    'kind',
    'ports',
    'slots',
    'effects',
    'review',
    'shape',
    'optional',
    'declaresRandomness',
    'scriptPoints',
    'sessionShape',
    'earlyExit',
    'causesEvent',
    'causesEventFrom',
    'payloads',
    'liveRow',
    'media',
    'entryShape',
    'bands',
    'bandPorts',
    'portSchemas',
];
/** @experimental */
export const DESCRIPTOR_POLICY_KEYS = [
    'i18n',
    'reviewDefault',
    'toggleable',
    'provisional',
    'public',
    'timeoutMs',
    'timeoutKind',
    'usage',
];
/** @experimental */
export const DESCRIPTOR_FIELDS_CLASSIFIED = true;
/** A definition's policy, projected — `undefined` keys dropped so a row and a re-read agree. @experimental */
export function definitionPolicy(d) {
    const policy = {};
    if (d.provisional === true)
        policy.provisional = true;
    if (d.reviewDefault !== undefined)
        policy.reviewDefault = d.reviewDefault;
    if (d.timeoutMs !== undefined)
        policy.timeoutMs = d.timeoutMs;
    if (d.timeoutKind !== undefined)
        policy.timeoutKind = d.timeoutKind;
    if (d.toggleable !== undefined)
        policy.toggleable = d.toggleable;
    // By id: the row carries which variable, and the registry says the rest.
    // Sorted, so a row and a re-read agree whatever order the author wrote.
    if (d.bands && Object.keys(d.bands).length)
        policy.bands = Object.fromEntries(Object.entries(d.bands)
            .map(([k, v]) => [k, typeof v === 'string' ? v : v.id])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    const bandPorts = bandPortsMaterial(d.bandPorts);
    if (bandPorts)
        policy.bandPorts = bandPorts;
    if (d.portSchemas !== undefined)
        policy.portSchemas = d.portSchemas;
    return policy;
}
/** `{ key: variableId }`, sorted by key; none and `{}` are one contract (absent). */
function bandsMaterial(bands) {
    if (!bands || !Object.keys(bands).length)
        return undefined;
    return Object.fromEntries(Object.entries(bands)
        .map(([k, v]) => [k, typeof v === 'string' ? v : v.id])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
/** `{ key: ports }`, keys and ports sorted; none and `{}` are one contract (absent). */
function bandPortsMaterial(bandPorts) {
    if (!bandPorts || !Object.keys(bandPorts).length)
        return undefined;
    return Object.fromEntries(Object.entries(bandPorts)
        .map(([k, ports]) => [k, [...ports].sort()])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
/** Out-port schemas, display text out; no declared port is the field absent. */
function portSchemasMaterial(p) {
    if (!p?.out || !Object.keys(p.out).length)
        return undefined;
    return contractData({ out: p.out });
}
const contractData = (v) => declarationData(v, DESCRIPTOR_DISPLAY_KEYS);
const flag = (v) => (v === true ? true : undefined);
const portShapes = (ports) => Object.fromEntries(Object.entries(ports ?? {}).map(([k, v]) => [
    k,
    typeof v === 'string' ? v : (v?.id ?? undefined),
]));
/** The contract of a definition — every `DESCRIPTOR_CONTRACT_KEYS` field, as data, and nothing else. @internal */
export function definitionContract(source) {
    const at = source.id.lastIndexOf('@');
    const pinned = at > 0 && /^\d+$/.test(source.id.slice(at + 1));
    const entryShape = source.entryShape && typeof source.entryShape === 'object'
        ? {
            ...source.entryShape,
            ...(source.configSchema !== undefined ? { fields: source.configSchema } : {}),
        }
        : undefined;
    return {
        id: pinned ? source.id.slice(0, at) : source.id,
        version: source.version ?? (pinned ? Number(source.id.slice(at + 1)) : 1),
        kind: source.kind,
        ports: { in: portShapes(source.ports?.in), out: portShapes(source.ports?.out) },
        slots: contractData(authoredSlots(source.slots)),
        effects: source.effects,
        review: source.review ? { fields: [...source.review.fields] } : undefined,
        shape: source.shape,
        optional: flag(source.optional),
        declaresRandomness: flag(source.declaresRandomness),
        scriptPoints: source.scriptPoints ? contractData(scriptPointsOf(source)) : undefined,
        sessionShape: contractData(source.sessionShape),
        earlyExit: flag(source.earlyExit),
        causesEvent: source.causesEvent,
        causesEventFrom: source.causesEventFrom,
        // Sorted: which payloads an inlet reads is a set, not a sequence.
        payloads: source.payloads?.length ? [...source.payloads].sort() : undefined,
        liveRow: flag(source.liveRow),
        media: contractData(source.media),
        entryShape: contractData(entryShape),
        // Contract that rides the row's policy (owner ruling 2026-09-27): a
        // descriptor's own field, else the row's policy spelling — one hash.
        bands: bandsMaterial(source.bands ?? source.policy?.bands ?? undefined),
        bandPorts: bandPortsMaterial(source.bandPorts ?? source.policy?.bandPorts ?? undefined),
        portSchemas: portSchemasMaterial(source.portSchemas ?? source.policy?.portSchemas ?? undefined),
        semantics: source.semantics,
    };
}
/**
 * The content hash of a definition — a digest of `definitionContract`, and
 * the one answer to *is this the same definition?* The registry guard below,
 * core's `pipeline_definition_registry` pointer and a run's receipt all name
 * this string.
 * @internal
 */
export function definitionContractHash(source) {
    return contentHash(definitionContract(source));
}
function register(d) {
    // Contract, not arrival (src/hash.ts): a re-declaration whose contract is
    // unchanged replaces the entry — policy and display text are the fresher
    // author's — and one whose contract moved is refused with both hashes.
    // Only computed when there is something to compare against, so the
    // ordinary path costs nothing.
    const existing = types.get(d.id);
    if (existing)
        refuseUnlessSameHash(definitionContractHash(existing), definitionContractHash(d), `duplicate type id: ${d.id}`);
    checkWritePublishes(d);
    checkNoAuthoredSettings(d);
    checkNoSettingsPort(d);
    checkScriptPointsAccept(d);
    checkCausesEvent(d);
    checkNoAmbientExtras(d);
    // Before the id is claimed, so a refused declaration can be fixed and retried.
    checkModeTitled(d);
    checkDisplayText(d);
    // Bands (typed templates P2): identifier keys, a registered variable whose
    // scope names the key, and one meaning per key across every definition.
    checkBandDeclarations(d, types.values());
    assertMessageVerbFloors(d.sessionShape, d.id);
    assertSessionWrites(d.sessionShape, d.id);
    assertTurnControls(d.sessionShape, d.id);
    assertChannelDecls(d.sessionShape, d.id);
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
 * The extras every script site is offered, whatever its slot lists (R32,
 * PLAN-turn-order §4.14): `session`, the run's settings document. The
 * executor supplies them at every site — a slot's port hook and an interior
 * point alike — so a slot's `extras` names only what is particular to it,
 * and listing an ambient one is refused (one way to say it, R26).
 * @internal
 */
export const AMBIENT_SCRIPT_EXTRAS = ['session'];
function checkNoAmbientExtras(d) {
    for (const [name, slot] of Object.entries(d.slots ?? {})) {
        const listed = slot.extras ?? [];
        const ambient = listed.filter((e) => AMBIENT_SCRIPT_EXTRAS.includes(e));
        if (ambient.length)
            throw new Error(`${d.id}: slot '${name}' lists ${ambient.map((e) => `'${e}'`).join(', ')} in its extras — ` +
                `every script site is handed ${AMBIENT_SCRIPT_EXTRAS.map((e) => `'${e}'`).join(', ')} already (R32); drop it from the list`);
    }
}
/** `{ a: shape, … }` as one comparable line, so a misfit names the ports. */
const portLine = (ports) => Object.entries(ports ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');
// Authored slots only: the registry adds the substrate `settings` slot to
// every definition (R-9), which a raw declaration does not carry (M4).
const slotLine = (slots) => Object.keys(authoredSlots(slots) ?? {}).sort().join(', ');
/**
 * Can `swap` stand in for `pinned` at node `key` (R28)? A swap is seated with
 * the pin's node config, so it must be the same kind with the same in- and
 * out-ports (by name and shape) and the same slots — a slot the pin's node
 * does not wire would never reach the swap, and a person would pick an
 * option that silently ignores its own settings. Script points are free: a
 * chain is configured on the node key, whatever sits there. One sentence
 * for the builder and the package pass alike.
 * @experimental
 */
export function swapFitFinding(key, pinned, swap) {
    // A provisional definition has no handler (plans/29 R-2): offering it
    // would put an option in front of a person that cannot run.
    if (swap.provisional)
        return `'${swap.id}' cannot stand in for '${key}': it is provisional — declared, with no handler to run`;
    // Plugins are blind to connections (R53): a node that uses one is one only
    // core's code can stand in for, whatever the fit.
    const usesConnection = Object.values(pinned.slots ?? {}).some((slot) => slot?.kind === 'connection');
    if (usesConnection && !swap.id.startsWith('core:'))
        return (`'${swap.id}' cannot stand in for '${key}': that node uses a connection, and a plugin's code never ` +
            `touches connection data or calls a model (R53) — shape the core node with prompts or a config instead` +
            pluginRuleRef('connections'));
    const want = `a ${pinned.kind} with in { ${portLine(pinned.ports?.in)} } → out { ${portLine(pinned.ports?.out)} } and slots [${slotLine(pinned.slots)}]`;
    const got = `a ${swap.kind} with in { ${portLine(swap.ports?.in)} } → out { ${portLine(swap.ports?.out)} } and slots [${slotLine(swap.slots)}]`;
    return want === got
        ? undefined
        : `'${swap.id}' cannot stand in for '${key}': a swap must match the pin's kind, ports and slots — ${want}; it is ${got}`;
}
/**
 * Can one inlet answer every event of an `events` lock (R33)? Each listed
 * event must carry a payload the inlet declares it reads; an inlet that
 * declares none answers one event only. One sentence for the builder and
 * the package pass alike.
 * @experimental
 */
export function eventsLockFindings(inlet, events) {
    const reads = inlet.payloads ?? [];
    if (!reads.length)
        return [
            `'${inlet.id}' declares no payloads, so it answers one event: { genre, event }. ` +
                `A spec answering several events uses an inlet that reads them all — ` +
                `core:inlet/session-event@1 (PLAN-turn-order §4.14)`,
        ];
    const out = [];
    for (const e of events) {
        const shape = eventById(e)?.payload;
        if (!eventById(e))
            continue; // refused by the lock's own event check, in its own words
        if (!shape)
            out.push(`'${e}' carries no payload, so it cannot share an inlet with other events — lock it alone: { genre, event }`);
        else if (!reads.includes(shape))
            out.push(`'${inlet.id}' does not read '${shape}', the payload of '${e}' — it reads ${reads.map((r) => `'${r}'`).join(', ')}`);
    }
    return out;
}
/**
 * `causesEvent` agrees with the event's own `causedBy` (R33). The event side
 * is the complete statement — `message-completed` is caused by three writes
 * whose own `causesEvent` names their primary event — so this field may only
 * name an event that already lists the definition. And only core defines
 * events (R30, F8): a package's outlet cannot cause one.
 */
function checkCausesEvent(d) {
    if (d.causesEventFrom !== undefined) {
        if (d.kind !== 'outlet' || d.effects !== 'write')
            throw new Error(`'${d.id}' declares causesEventFrom — only a write outlet causes an event`);
        if (d.causesEvent)
            throw new Error(`'${d.id}' declares both causesEvent and causesEventFrom — one says which event, not both`);
        if (!d.ports.in?.[d.causesEventFrom])
            throw new Error(`'${d.id}' names causesEventFrom '${d.causesEventFrom}', which is not one of its in-ports`);
        return;
    }
    if (!d.causesEvent)
        return;
    const event = eventById(d.causesEvent);
    if (!event)
        throw new Error(`${d.id}: ${notADeclaredEvent(d.causesEvent)}`);
    const base = d.id.replace(/@\d+$/, '');
    if (!event.causedBy?.includes(base))
        throw new Error(`'${d.id}' causes '${d.causesEvent}', but that event's causedBy does not name '${base}'. ` +
            `causedBy is the one statement of what causes what — add '${base}' there, or drop causesEvent (R33)`);
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
 * Nor an out-port of the name (F39; U7 review, S2).
 *
 * `<nodeKey>.settings` and `<nodeKey>.settings.*` are the address the
 * validator and the executor read as the substrate's switches: a data edge
 * drawn from it is refused as a setting travelling (F39), and a reference to
 * it resolves to nothing. A definition publishing an out-port of that name
 * would have every edge from the port refused under a law about something
 * else — a port nobody could wire — so the name is refused where the author
 * is, and the F39 edge rule can never mistake a declared port for a switch.
 * `register()` is F39's registry door: `core:verdict/settings-travel` judges
 * each declared out-port and this quotes it (01 §13).
 */
function checkNoSettingsPort(d) {
    for (const port of Object.keys(d.ports?.out ?? {})) {
        const heard = settingsTravelVerdict.judge({ kind: 'port', definitionId: d.id, port });
        if (!heard.ok)
            throw new Error(refusalText(heard));
    }
}
/**
 * A script point names the kinds it accepts (R-11; U4 residual 2026-09-16).
 * A point nothing can attach to is a control with no effect wearing a
 * contract: the panel would offer the hook and every kind would be refused
 * at it.
 */
function checkScriptPointsAccept(d) {
    for (const p of d.scriptPoints ?? []) {
        const point = p;
        const key = typeof point === 'string' ? point : String(point?.key);
        const accepts = typeof point === 'string' ? undefined : point?.accepts;
        if (!Array.isArray(accepts) || accepts.length === 0)
            throw new Error(`${d.id} declares script point '${key}' accepting no script kind. A point is ` +
                `{ key, accepts, label } — list the kinds it takes (e.g. ['core:script:text/transform@1']); ` +
                `a point that accepts nothing is a hook nothing can attach to.`);
    }
}
const shapeIdOf = (s) => typeof s === 'string' ? s : (s?.id ?? undefined);
/**
 * Is there text a person reads — a non-blank string, or a map with a non-blank
 * `en`? A map carrying only `fr` is not titled: `en` is the locale every other
 * falls back to (R-20), so a card with no `en` has no face on an English install.
 */
const hasDisplayText = (v) => isI18n(v);
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
/**
 * Every display string a definition declares is `I18n` (R-20; U5i, ruled
 * 2026-09-17): `i18n.name` and `i18n.description`; each slot's `description`,
 * its prompt `fields[].i18n` and its `schema` (through `settingsSchemaFindings`);
 * each script point's `label`, `description` and deprecated `i18n`; a session
 * shape's `fields` and its `panels[].title`; an entry shape's `fields`. All
 * kinds, not only a mode-bearing inlet — `checkModeTitled` keeps the one
 * strictness of its own (a mode must have a name); this refuses a blank or a
 * mis-shaped value anywhere, with the field named and the fix stated.
 */
function checkDisplayText(d) {
    const findings = [];
    findings.push(...i18nFindings(d.i18n?.name, `${d.id} i18n.name`));
    findings.push(...i18nFindings(d.i18n?.description, `${d.id} i18n.description`));
    for (const [slotName, slot] of Object.entries(d.slots ?? {})) {
        if (!slot)
            continue;
        const at = `${d.id} slots.${slotName}`;
        findings.push(...i18nFindings(slot.description, `${at}.description`));
        for (const [field, decl] of Object.entries(slot.fields ?? {}))
            findings.push(...i18nFindings(decl?.i18n, `${at}.fields.${field}.i18n`));
        findings.push(...settingsSchemaFindings(slot.schema, `${at}.schema`));
    }
    for (const p of d.scriptPoints ?? []) {
        const at = `${d.id} scriptPoints[${String(p.key)}]`;
        findings.push(...i18nFindings(p.label, `${at}.label`));
        findings.push(...i18nFindings(p.description, `${at}.description`));
    }
    if (d.sessionShape) {
        findings.push(...settingsSchemaFindings(d.sessionShape.fields, `${d.id} sessionShape.fields`));
        findings.push(...widgetDeclsFindings(d.sessionShape.panels, `${d.id} sessionShape.panels`));
    }
    if (d.entryShape)
        findings.push(...settingsSchemaFindings(d.entryShape.fields, `${d.id} entryShape.fields`));
    if (findings.length)
        throw new Error(`${d.id} declares display text a publish refuses (R-20):\n · ${findings.join('\n · ')}`);
}
/**
 * The display text of a list of widget declarations (R-20): each `title`
 * (required — the chrome and the tray show it) and each `settings` schema.
 * Shared by a session shape's `panels` and a genre's shape, which carry the
 * same declarations.
 * @experimental
 */
export function widgetDeclsFindings(raw, where) {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        return [`${where}: the widgets are an array of declarations`];
    const out = [];
    raw.forEach((w, i) => {
        const decl = w;
        const at = `${where}[${typeof decl?.id === 'string' ? decl.id : i}]`;
        if (!decl || typeof decl !== 'object') {
            out.push(`${at}: a widget declaration is an object — { id, title, component }`);
            return;
        }
        out.push(...i18nFindings(decl.title, `${at}.title`, { required: true }));
        out.push(...settingsSchemaFindings(decl.settings, `${at}.settings`));
        // The base sections it reads (R75): a name outside them is refused here.
        out.push(...widgetReadsFindings(decl.reads, `${at}.reads`));
        // What renders inside: `component` (R25) or the deprecated `surface`
        // alias (R24) — exactly one, and a written `remote` is refused.
        const hasComponent = decl.component !== undefined;
        const surface = decl.surface;
        if (hasComponent && surface !== undefined)
            out.push(`${at}: give \`component\` or the deprecated \`surface\`, not both`);
        else if (!hasComponent && surface === undefined)
            out.push(`${at}: names nothing to render — give \`component\`, a component's slug`);
        else if (hasComponent && (typeof decl.component !== 'string' || !decl.component))
            out.push(`${at}.component: a component's slug`);
        else if (surface !== undefined && surface?.kind !== 'frame')
            out.push(surface?.kind === 'remote'
                ? `${at}.surface: a remote is not written — give \`component\`, the component's slug (R25)`
                : surface?.kind === 'native'
                    ? `${at}.surface: 'native' is retired (R79) — give \`component\`, the component's slug`
                    : `${at}.surface.kind: 'frame' (deprecated — give \`component\`)`);
    });
    return out;
}
/** @experimental */
export function getDefinition(id) {
    return types.get(id);
}
/** @experimental */
export function allDefinitions() {
    return [...types.values()];
}
/** @experimental */
export function _clearDefinitions() {
    types.clear();
    registrationFindings.clear();
}
// ── describe*Definition — one per kind, same shape, no modality anywhere ─────
//
// `describeInletDefinition · describeQueryDefinition · describeTaskDefinition ·
// describeOracleDefinition · describeOutletDefinition`. `describeEntryType`
// keeps *type*: the entry-type word is not yet ruled (NOMENCLATURE §5).
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
 * @experimental
 */
export const describeInletDefinition = (d) => register({ ...d, kind: 'inlet' });
/** @experimental */
export const describeQueryDefinition = (d) => register({ ...d, kind: 'query' });
/** @public */
export const describeTaskDefinition = (d) => register({ ...d, kind: 'task' });
/**
 * An oracle definition.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 * @experimental
 */
export const describeOracleDefinition = (
// The slot validation lives in the PARAMETER, not in `S`'s constraint. A
// constraint of `Record<string, SlotDecl>` widens each slot to SlotDecl's own
// declared types, so `optional: ['json_schema']` arrives as
// `readonly CapabilityId[]` and `ctx.can()` narrows to nothing. Intersecting
// here validates just as strictly while leaving `S` the literal it was written
// as — which is the whole basis of the typed probe.
d) => register({ ...d, kind: 'oracle' });
/** @experimental */
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
 * @experimental
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
 * @experimental
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
 * @experimental
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
 * @experimental
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
 * @experimental
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
 * @experimental
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
/** Every entry type this build declares. @internal */
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
 * @experimental
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
/** @public */
export function pin(descriptor) {
    const version = /@(\d+)$/.exec(descriptor.id)?.[1] ?? '1';
    const ctor = (config = {}) => ({
        __node: true,
        descriptor,
        config,
    });
    return { [`v${version}`]: ctor, id: descriptor.id, descriptor };
}
/**
 * The in-ports that make a `liveRow` outlet's write the run's live row (F7,
 * W1): a placeholder (`generating`) or a claimed row (`row`). Anything else
 * the outlet writes is a complete row — an ordinary write, as many as the
 * pipeline likes.
 * @experimental
 */
export const LIVE_ROW_PORTS = ['generating', 'row'];
/** Whether a `liveRow` outlet's resolved payload opens the live row (see `LIVE_ROW_PORTS`). @experimental */
export function opensLiveRow(payload) {
    if (!payload || typeof payload !== 'object')
        return false;
    const p = payload;
    return Boolean(p.generating) || (p.row !== undefined && p.row !== null);
}
//# sourceMappingURL=descriptors.js.map