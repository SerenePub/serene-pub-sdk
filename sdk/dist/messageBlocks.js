/**
 * Message blocks (20 §6) — custom message content as **data, not code**.
 *
 * A plugin's message part carries a block tree in `data.blocks`; core renders
 * it with its own components. Nothing to sanitize (no HTML crosses the
 * boundary), theming and accessibility are core's once for everyone, and
 * interactivity is *declared*: a `choices` button or a `form` submit names a
 * function key, and pressing it fires the trigger machinery with the message
 * as subject — the same audited path every contributed button already takes.
 *
 * The validator is the write-time gate: a hostile or malformed tree is refused
 * with the block path named, and the caps make "render whatever a sandboxed
 * hook produced" a bounded promise. Findings carry a `fix` like every finding
 * in this SDK (15 §1.3).
 */
import { checkSchema } from './settings.js';
import { ACTION_IDENTITY, ACTION_IDENTITY_MAX_LENGTH, actionsOf, effectsOf, worldActionCrossing, } from './actions.js';
import { isParticipantRef } from './participants.js';
// The two verdicts declared here rather than in `verdicts.ts` (01 §13): their
// judges call `worldBlockFunctions` and `isFormStale`, which live here, and
// `verdicts.ts` must stay below every door — see its docblock.
import { defineVerdict } from './verdicts.js';
/** The caps that make rendering a sandbox's output a bounded promise. @experimental */
export const MESSAGE_BLOCK_LIMITS = {
    maxBlocks: 64,
    maxDepth: 3,
    maxText: 64 * 1024,
    maxRows: 64,
    maxActions: 12
};
/** The longest block id the validator accepts; a host's uuid is 36. @experimental */
export const BLOCK_ID_MAX_LENGTH = 64;
const finding = (path, message, fix) => ({
    path,
    message,
    fix,
});
/**
 * Validate a candidate block tree. Empty findings = renderable. Total, never
 * throws — the host refuses a write on findings rather than crashing on one.
 * @internal
 */
export function checkMessageBlocks(value) {
    const f = [];
    if (!Array.isArray(value))
        return [finding('blocks', 'is not an array', 'send an array of blocks')];
    let count = 0;
    const str = (v, path, what) => {
        if (typeof v !== 'string') {
            f.push(finding(path, `${what} is not a string`, 'send text'));
            return false;
        }
        if (v.length > MESSAGE_BLOCK_LIMITS.maxText)
            f.push(finding(path, `${what} exceeds ${MESSAGE_BLOCK_LIMITS.maxText} bytes`, 'shorten it — a block is a card, not a document'));
        return true;
    };
    /** `action` is optional; present, it is an identity and nothing looser. */
    const identity = (v, path) => {
        if (v === undefined)
            return;
        if (typeof v !== 'string' || v.length > ACTION_IDENTITY_MAX_LENGTH || !ACTION_IDENTITY.test(v))
            f.push(finding(path, 'is not an action identity', "name the declaration as '<spec slug>#<key>', or omit it — the outlet stamps it"));
    };
    /** The form fields (`FormBlockFields`): an optional id, an optional head, an optional participant reference. */
    const formFields = (b, p) => {
        if (b.id !== undefined && (typeof b.id !== 'string' || !b.id || b.id.length > BLOCK_ID_MAX_LENGTH))
            f.push(finding(`${p}.id`, 'is not a block id', 'omit it — the host stamps one at the write'));
        // Host-owned like `id` (U5f): a well-formed value passes, a malformed
        // one is named; either way the host stamps its own at the write.
        if (b.head !== undefined && !isChannelHead(b.head))
            f.push(finding(`${p}.head`, 'is not a channel head', 'omit it — the host stamps the channel head at the write'));
        if (b.addressee !== undefined && !isParticipantRef(b.addressee))
            f.push(finding(`${p}.addressee`, 'is not a participant reference', "address the form to 'character:<id>', 'envoy:<slug>', 'owner' or 'user:<id>', or omit it"));
        if (b.question !== undefined)
            str(b.question, `${p}.question`, 'question');
        else if (b.addressee !== undefined)
            f.push(finding(`${p}.question`, 'is missing on an addressed form', 'say what is being asked — the addressee (or the oracle answering for them) needs the question'));
        if (b.referent !== undefined)
            str(b.referent, `${p}.referent`, 'referent');
        if (b.answered !== undefined && !isFormAnswered(b.answered))
            f.push(finding(`${p}.answered`, 'is not an answer record', "omit it — the host stamps { by, at, choice? } once the form is answered"));
    };
    const walk = (blocks, path, depth) => {
        if (depth > MESSAGE_BLOCK_LIMITS.maxDepth) {
            f.push(finding(path, `nesting exceeds depth ${MESSAGE_BLOCK_LIMITS.maxDepth}`, 'flatten the groups'));
            return;
        }
        for (let i = 0; i < blocks.length; i++) {
            const p = `${path}[${i}]`;
            if (++count > MESSAGE_BLOCK_LIMITS.maxBlocks) {
                f.push(finding(p, `more than ${MESSAGE_BLOCK_LIMITS.maxBlocks} blocks in the tree`, 'split the message'));
                return;
            }
            const b = blocks[i];
            if (!b || typeof b !== 'object' || Array.isArray(b)) {
                f.push(finding(p, 'is not a block object', 'send {kind, …}'));
                continue;
            }
            switch (b.kind) {
                case 'md':
                    str(b.text, `${p}.text`, 'text');
                    break;
                case 'kv': {
                    if (!Array.isArray(b.rows)) {
                        f.push(finding(`${p}.rows`, 'is not an array', 'send label/value rows'));
                        break;
                    }
                    if (b.rows.length > MESSAGE_BLOCK_LIMITS.maxRows)
                        f.push(finding(`${p}.rows`, `more than ${MESSAGE_BLOCK_LIMITS.maxRows} rows`, 'trim the list'));
                    for (let r = 0; r < b.rows.length; r++) {
                        const row = b.rows[r];
                        str(row?.label, `${p}.rows[${r}].label`, 'label');
                        str(row?.value, `${p}.rows[${r}].value`, 'value');
                    }
                    break;
                }
                case 'table': {
                    if (!Array.isArray(b.columns) || !b.columns.every((c) => typeof c === 'string'))
                        f.push(finding(`${p}.columns`, 'is not a string array', 'send column names'));
                    if (!Array.isArray(b.rows))
                        f.push(finding(`${p}.rows`, 'is not an array', 'send rows'));
                    else {
                        if (b.rows.length > MESSAGE_BLOCK_LIMITS.maxRows)
                            f.push(finding(`${p}.rows`, `more than ${MESSAGE_BLOCK_LIMITS.maxRows} rows`, 'trim the table'));
                        for (let r = 0; r < b.rows.length; r++)
                            if (!Array.isArray(b.rows[r]) || !b.rows[r].every((c) => typeof c === 'string'))
                                f.push(finding(`${p}.rows[${r}]`, 'is not a string array', 'send cell text'));
                    }
                    break;
                }
                case 'stat':
                    str(b.label, `${p}.label`, 'label');
                    if (typeof b.value !== 'number' || !Number.isFinite(b.value))
                        f.push(finding(`${p}.value`, 'is not a number', 'send a finite number'));
                    if (b.max !== undefined && (typeof b.max !== 'number' || !Number.isFinite(b.max)))
                        f.push(finding(`${p}.max`, 'is not a number', 'send a finite number, or omit it'));
                    break;
                case 'image':
                    if (!Number.isInteger(b.assetId))
                        f.push(finding(`${p}.assetId`, 'is not a session-asset id', 'attach the bytes first; blocks reference assets, never foreign URLs'));
                    break;
                case 'choices': {
                    if (!Array.isArray(b.actions) || !b.actions.length) {
                        f.push(finding(`${p}.actions`, 'is empty or not an array', 'send at least one action'));
                        break;
                    }
                    if (b.actions.length > MESSAGE_BLOCK_LIMITS.maxActions)
                        f.push(finding(`${p}.actions`, `more than ${MESSAGE_BLOCK_LIMITS.maxActions} actions`, 'fewer, clearer choices'));
                    formFields(b, p);
                    const choices = new Set();
                    for (let a = 0; a < b.actions.length; a++) {
                        const act = b.actions[a];
                        str(act?.fn, `${p}.actions[${a}].fn`, 'fn');
                        identity(act?.action, `${p}.actions[${a}].action`);
                        str(act?.label, `${p}.actions[${a}].label`, 'label');
                        if (act?.choice !== undefined) {
                            if (typeof act.choice !== 'string' || !act.choice)
                                f.push(finding(`${p}.actions[${a}].choice`, 'is not an option key', 'name the option with a non-empty string, or omit it'));
                            else if (choices.has(act.choice))
                                f.push(finding(`${p}.actions[${a}].choice`, `repeats the option key '${act.choice}'`, 'give each option its own key — an answer names one'));
                            else
                                choices.add(act.choice);
                        }
                        else if (b.addressee !== undefined)
                            f.push(finding(`${p}.actions[${a}].choice`, 'is missing on an addressed question', "give each option a 'choice' key — a form's answer names one, and the oracle's schema is an enum of them"));
                    }
                    break;
                }
                case 'form': {
                    str(b.fn, `${p}.fn`, 'fn');
                    identity(b.action, `${p}.action`);
                    formFields(b, p);
                    if (!b.fields || typeof b.fields !== 'object' || Array.isArray(b.fields))
                        f.push(finding(`${p}.fields`, 'is not a settings schema', 'declare fields with the one field language'));
                    else
                        for (const sf of checkSchema(b.fields))
                            f.push(finding(`${p}.fields.${sf.field ?? ''}`, sf.message, sf.fix));
                    break;
                }
                case 'group':
                    if (!Array.isArray(b.blocks))
                        f.push(finding(`${p}.blocks`, 'is not an array', 'nest an array of blocks'));
                    else
                        walk(b.blocks, `${p}.blocks`, depth + 1);
                    break;
                default:
                    f.push(finding(p, `unknown block kind '${String(b.kind)}'`, 'use one of: md, kv, table, stat, image, choices, form, group'));
            }
        }
    };
    walk(value, 'blocks', 1);
    return f;
}
/**
 * Stamp each `choices` button and `form` in a tree with the identity of the
 * declaration it fires — the outlet's half of W-E, called where a block part
 * is written with the run's spec in hand. That is the host's seam, not the
 * SDK's: in Serene Pub the executor's host scope carries the running
 * document's slug (`runtime/host.ts`, `HostScope.specId`) and its message
 * outlet is where the stamp lands; the `blocks` port U5d builds is built on
 * this call. The SDK declares no `HostScope` — a host wired by hand passes
 * `{ id, contributes }` from wherever it keeps the running spec.
 *
 * The identity is `<spec id>#<key>` for the action of `spec` whose `key`
 * is the block's `fn` (plans/31 V2: the key is the identity's second half,
 * so `fn` names at most one). A block whose `fn` the spec declares no
 * action for is left unstamped — it fires as legacy and gets the
 * owner floor — rather than guessed; and a block that already carries an
 * `action` keeps it, so a spec may name a declaration of another spec's on
 * purpose. Returns a copy; the input is never mutated.
 * @internal
 */
export function stampBlockActions(blocks, spec) {
    const byKey = new Map();
    for (const a of actionsOf(spec))
        byKey.set(a.key, `${spec.id}#${a.key}`);
    const identityFor = (fn) => byKey.get(fn);
    const stamp = (ref) => {
        if (ref.action !== undefined)
            return ref;
        const action = identityFor(ref.fn);
        return action === undefined ? ref : { ...ref, action };
    };
    const walk = (list) => list.map((b) => {
        switch (b.kind) {
            case 'choices':
                return { ...b, actions: b.actions.map(stamp) };
            case 'form':
                return stamp(b);
            case 'group':
                return { ...b, blocks: walk(b.blocks) };
            default:
                return b;
        }
    });
    return walk(blocks);
}
/* ── Forms: what the host reads off a block tree (30 §U5d) ───────────────── */
/** A well-formed `FormAnswered` — the shape the host stamps and the validator accepts. @experimental */
export function isFormAnswered(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return false;
    const a = v;
    return (isParticipantRef(a.by) &&
        typeof a.at === 'string' &&
        !!a.at &&
        (a.choice === undefined || (typeof a.choice === 'string' && !!a.choice)));
}
/**
 * Every `choices` and `form` block in a tree, in render order, groups
 * flattened — the blocks a fire, an event or an answer can name.
 * @internal
 */
export function formBlocksOf(blocks) {
    const out = [];
    const walk = (list) => {
        for (const b of list) {
            if (b.kind === 'choices' || b.kind === 'form')
                out.push(b);
            else if (b.kind === 'group')
                walk(b.blocks);
        }
    };
    walk(blocks);
    return out;
}
/** The form block carrying `id`, or undefined. @internal */
export function findFormBlock(blocks, id) {
    return formBlocksOf(blocks).find((b) => b.id === id);
}
/**
 * Every function a `choices` option or a `form` names, deduplicated — what
 * the writing spec must declare an action for. A block whose `fn` the spec
 * declares no action for is refused at the write: nothing would ever be held
 * to an audience for it.
 * @experimental
 */
export function blockFunctionsOf(blocks) {
    const fns = new Set();
    for (const b of formBlocksOf(blocks))
        if (b.kind === 'choices')
            for (const a of b.actions)
                fns.add(a.fn);
        else
            fns.add(b.fn);
    return [...fns];
}
/**
 * The functions a tree names that `spec` declares no action for — the
 * refusal the host makes before it stamps (`stampBlockActions` leaves such a
 * block unstamped rather than guessing; the write refuses it instead, with
 * the function named). A reference that already **names its action** — a
 * spec pointing a block at another spec's declaration on purpose, the way
 * the Adventure genre's Ask points its options at Answer — is not judged
 * here: the host holds the named identity to the installed declaration
 * instead (`foreignBlockActions`).
 * @internal
 */
export function undeclaredBlockFunctions(blocks, spec) {
    const declared = new Set(actionsOf(spec).map((a) => a.key));
    const fns = new Set();
    for (const b of formBlocksOf(blocks))
        if (b.kind === 'choices') {
            for (const a of b.actions)
                if (a.action === undefined && !declared.has(a.fn))
                    fns.add(a.fn);
        }
        else if (b.action === undefined && !declared.has(b.fn))
            fns.add(b.fn);
    return [...fns];
}
/**
 * The action identities a tree names that are **not** `spec`'s own — the
 * declarations of other specs a block points at on purpose. The host holds
 * each to the installed declaration: it must exist for the session's genre,
 * and it may not be `world` (the effects line).
 * @internal
 */
export function foreignBlockActions(blocks, spec) {
    const own = new Set(actionsOf(spec).map((a) => `${spec.id}#${a.key}`));
    const out = new Set();
    for (const b of formBlocksOf(blocks))
        if (b.kind === 'choices') {
            for (const a of b.actions)
                if (a.action !== undefined && !own.has(a.action))
                    out.add(a.action);
        }
        else if (b.action !== undefined && !own.has(b.action))
            out.add(b.action);
    return [...out];
}
/**
 * **The one addressee a `world` action may be named to** (L1, ruled
 * 2026-09-17): the session's owner, and nobody else.
 *
 * `owner` the role, never `user:<id>` — this half of the law is pure and
 * holds no session, so it cannot know which person owns one; a reference that
 * happens to name the owner is resolved at the press, where the host can ask.
 * @experimental
 */
export const isOwnerAddressed = (addressee) => addressee === 'owner';
/**
 * The effects line (plans/29 R-15 *The line*; 09-B F39): a block naming a
 * `world` action — one whose result touches cards, lorebooks, settings,
 * permissions, connections — is refused. Such an action lives in the
 * composer or the review gate and is owner-only; a message carrying it would
 * put an out-of-fiction effect where a character could be asked to answer
 * it. Returns the functions of the offending actions.
 *
 * ## The one exception: a block addressed to the **owner** (L1, 2026-09-17)
 *
 * A `choices` or `form` block whose `addressee` is `owner` may name a `world`
 * action. The reasoning is the line's own: the rule exists so that an
 * out-of-fiction effect is never *a question a character could be asked*, and
 * a form put to the owner is not that question — the owner is already the
 * whole of such an action's `act` audience (`WORLD_ACTION_ACTORS`), and
 * pressing the button is the owner acting, in the one place the line has
 * always allowed them to. Every other addressee — a character, a persona,
 * a user by id, or none at all (“nobody in particular”, which anyone the
 * audience admits may press) — keeps the refusal.
 *
 * ⚠ The **venue** half of F41 is untouched: an action declaring
 * `venue: { kind: 'form' }` still may not be `world`, because a venue is
 * declared and an addressee is decided at run time, so the construction-time
 * check cannot see one. An owner-addressed block therefore names a
 * `composer`-venue world action — the Lair genre's knock does exactly this
 * — and `form` stays fiction-only.
 * @experimental
 */
export function worldBlockFunctions(blocks, spec) {
    const world = new Set(actionsOf(spec)
        .filter((a) => effectsOf(a) === 'world')
        .map((a) => a.key));
    const fns = new Set();
    for (const b of formBlocksOf(blocks)) {
        if (isOwnerAddressed(b.addressee))
            continue;
        if (b.kind === 'choices') {
            for (const a of b.actions)
                if (world.has(a.fn))
                    fns.add(a.fn);
        }
        else if (world.has(b.fn))
            fns.add(b.fn);
    }
    return [...fns];
}
/** The one sentence a block that carries a `world` action is refused with, whichever way it named it. */
const worldBlockSentence = (named) => `the blocks name ${named}, whose action changes something outside the story (effects: 'world'). ` +
    `Such an action is the owner's, from the composer or the review gate — the one block that may ` +
    `carry it is one addressed to 'owner' (the effects line, R-15)`;
/**
 * The effects line (plans/29 R-15 *The line*; F41), as one verdict: an
 * out-of-fiction effect — cards, lore, settings, permissions — is the
 * owner's (or an administrator's), from the composer or the review gate, and
 * never a question a character could be asked. Heard at the declaration
 * (`actionFindingsByLaw`: the builder, `validate()`, the packager, a host's
 * publish), at the write (`worldBlockFunctions`, the host's block gate) and
 * at the fire (the host's `fireAction`). The one exception is L1's: a block
 * addressed to the **owner** may carry it, because the owner is already the
 * whole of such an action's `act` audience and pressing the button is the
 * owner acting. A fire made **as** a participant has no exception — that is
 * the answer pipeline answering for someone, and an oracle granting a
 * permission is the thing the line exists to make impossible.
 * @internal
 */
export const effectsLineVerdict = defineVerdict({
    id: 'core:verdict/effects-line',
    law: 'F41',
    doors: ['construction', 'validate', 'publish', 'write', 'fire'],
    judge(input) {
        switch (input.kind) {
            case 'venue':
            case 'actor':
                return worldActionCrossing(input);
            case 'block': {
                const world = worldBlockFunctions(input.blocks, input.spec);
                if (!world.length)
                    return { ok: true };
                return { ok: false, sentence: worldBlockSentence(world.map((f) => `'${f}'`).join(', ')) };
            }
            case 'identity': {
                // Admitted only when every block naming it is the owner's — and
                // there is at least one: an identity nobody is known to have put
                // to the owner is not known to be the owner's.
                const ownersOnly = input.addressees.length > 0 && input.addressees.every(isOwnerAddressed);
                if (input.effects !== 'world' || ownersOnly)
                    return { ok: true };
                return { ok: false, sentence: worldBlockSentence(`'${input.identity}'`) };
            }
            case 'press': {
                if (input.effects !== 'world')
                    return { ok: true };
                if (!input.as && !(input.onBlock && !isOwnerAddressed(input.blockAddressee)))
                    return { ok: true };
                return {
                    ok: false,
                    sentence: `'${input.name}' changes something outside the story, so it is the owner's to ` +
                        `invoke from the composer, or from a question put to them — never a question ` +
                        `put to anybody else.`,
                };
            }
            default:
                return {
                    ok: false,
                    sentence: `'${String(input.kind)}' is not a shape this verdict judges — one of 'venue', 'actor', 'block', 'identity', 'press'.`,
                };
        }
    },
    failing: (door) => door === 'write'
        ? {
            kind: 'block',
            blocks: [
                {
                    kind: 'choices',
                    question: 'Give them the keys?',
                    actions: [{ fn: 'grant', label: 'Yes', choice: 'yes' }],
                },
            ],
            spec: {
                id: 'conformance:spec/world-in-composer',
                contributes: {
                    actions: [
                        {
                            key: 'grant',
                            genre: 'core:genre/chat',
                            venue: { kind: 'composer' },
                            label: { en: 'Grant' },
                            description: { en: 'Grant a permission outside the story.' },
                            effects: 'world',
                        },
                    ],
                },
            },
        }
        : door === 'fire'
            ? { kind: 'press', name: 'Grant', effects: 'world', as: true, onBlock: false, blockAddressee: undefined }
            : { kind: 'venue', where: 'contributes.actions[grant]', effects: 'world', venue: 'widget' },
});
/**
 * Stamp an `id` on every `choices` and `form` block that has none — the
 * host's half, at the write, with the host's id maker (a uuid). A block that
 * already carries one keeps it. Returns a copy; the input is never mutated.
 * @internal
 */
export function assignBlockIds(blocks, makeId) {
    const walk = (list) => list.map((b) => {
        switch (b.kind) {
            case 'choices':
            case 'form':
                return b.id ? b : { ...b, id: makeId() };
            case 'group':
                return { ...b, blocks: walk(b.blocks) };
            default:
                return b;
        }
    });
    return walk(blocks);
}
/** A channel head as a block carries it: a positive integer message id. @experimental */
export const isChannelHead = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
/**
 * Stamp the **channel head** on every `choices` and `form` block (plans/29
 * R-15 *Staleness and order*; 30 §U5f) — the host's half, at the write,
 * with the head it read off the channel. Unlike `assignBlockIds`, a value
 * the block already carries is **replaced**: the head is a fact about the
 * channel at the write, and only the host holds the channel. Returns a
 * copy; the input is never mutated.
 * @internal
 */
export function assignBlockHead(blocks, head) {
    const walk = (list) => list.map((b) => {
        switch (b.kind) {
            case 'choices':
            case 'form':
                return { ...b, head };
            case 'group':
                return { ...b, blocks: walk(b.blocks) };
            default:
                return b;
        }
    });
    return walk(blocks);
}
/**
 * Is this form **stale** — issued at a channel head the channel has since
 * moved past, and still unanswered? The one rule (R-15 *Staleness and
 * order*), written once so the host's door and a client's render agree:
 *
 *     !answered && head != null && headNow > head
 *
 * `headNow` is the greatest message id on the block's row's channel as the
 * caller holds it, leaving out the row's own answers (rows whose
 * `metadata.answersForm.messageId` is the block's row) — deleted rows are
 * gone and do not count, hidden rows still exist and do. Answered beats
 * stale everywhere: a form answered before the head moved stays answered.
 * A block with no `head` is never stale.
 * @experimental
 */
export function isFormStale(block, headNow) {
    if (block.answered)
        return false;
    if (!isChannelHead(block.head))
        return false;
    if (headNow == null)
        return false;
    return headNow > block.head;
}
/** @internal */
export const stalenessVerdict = defineVerdict({
    id: 'core:verdict/staleness',
    law: 'U5f',
    doors: ['fire', 'list'],
    judge({ block, headNow }) {
        if (!isFormStale(block, headNow))
            return { ok: true };
        return {
            ok: false,
            sentence: 'That question was overtaken — the conversation moved on before it was answered.',
        };
    },
    failing: () => ({ block: { head: 3 }, headNow: 4 }),
});
/**
 * The JSON Schema an oracle answers a form against (R-15: "an oracle with
 * `json` capability answers against the form's schema").
 *
 *  - `choices` → `{ choice: <enum of the option keys> }`, required.
 *  - `form` → the field schema, mapped field by field (`fieldsToJsonSchema`).
 *
 * A `choices` block whose options carry no keys yields an empty enum, which
 * is what the validator refuses on an addressed block before it is written.
 * @internal
 */
export function formAnswerSchema(block) {
    if (block.kind === 'choices')
        return {
            type: 'object',
            properties: {
                choice: {
                    type: 'string',
                    enum: block.actions.map((a) => a.choice).filter((c) => !!c),
                },
            },
            required: ['choice'],
            additionalProperties: false,
        };
    return fieldsToJsonSchema(block.fields);
}
/**
 * The one field language as JSON Schema — for a `form` block's answer, and
 * for anything else that hands a `SettingsSchema` to a model. Every field
 * type maps; `secret` and `media` map to strings because that is what a
 * model could produce, and a form asking a character for either is a form
 * the author should not have written.
 * @experimental
 */
export function fieldsToJsonSchema(fields) {
    const properties = {};
    const required = [];
    for (const [key, decl] of Object.entries(fields)) {
        properties[key] = fieldToJsonSchema(decl);
        if (decl.required)
            required.push(key);
    }
    return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
    };
}
function fieldToJsonSchema(decl) {
    const describe = typeof decl.description === 'string' ? { description: decl.description } : {};
    switch (decl.type) {
        case 'boolean':
            return { type: 'boolean', ...describe };
        case 'integer':
        case 'number':
            return {
                type: decl.type,
                ...(decl.min !== undefined ? { minimum: decl.min } : {}),
                ...(decl.max !== undefined ? { maximum: decl.max } : {}),
                ...describe,
            };
        case 'enum': {
            const of = decl.of ?? decl.members?.map((m) => m.key) ?? [];
            return { type: 'string', enum: [...of], ...describe };
        }
        case 'string[]':
            return { type: 'array', items: { type: 'string' }, ...describe };
        case 'list':
            return {
                type: 'array',
                items: decl.item ? fieldToJsonSchema(decl.item) : {},
                ...(decl.min !== undefined ? { minItems: decl.min } : {}),
                ...(decl.max !== undefined ? { maxItems: decl.max } : {}),
                ...describe,
            };
        case 'object':
            return { ...fieldsToJsonSchema(decl.fields ?? {}), ...describe };
        case 'share':
        case 'perMember':
        case 'strengths':
            return {
                type: 'object',
                properties: Object.fromEntries((decl.members ?? []).map((m) => [m.key, { type: 'number' }])),
                additionalProperties: false,
                ...describe,
            };
        default:
            return { type: 'string', ...describe };
    }
}
/**
 * The fire a form's answer becomes — what a press sends, and what the
 * answer pipeline commits "exactly as a click would": the block's function,
 * its stamped identity, and the payload. For `choices` the payload is
 * `{ choice }`; for `form` it is the answered values. Null when the answer
 * names no option the block offers, or is not an object — an oracle's
 * answer is checked here before anything is fired.
 * @internal
 */
export function formFireOf(block, answer) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer))
        return null;
    const a = answer;
    if (block.kind === 'choices') {
        const option = block.actions.find((o) => o.choice !== undefined && o.choice === a.choice);
        if (!option)
            return null;
        return {
            fn: option.fn,
            action: option.action,
            payload: { choice: option.choice },
            label: option.label,
        };
    }
    return { fn: block.fn, action: block.action, payload: { ...a } };
}
//# sourceMappingURL=messageBlocks.js.map