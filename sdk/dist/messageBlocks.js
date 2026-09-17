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
import { ACTION_IDENTITY, ACTION_IDENTITY_MAX_LENGTH, actionsOf, effectsOf } from './actions.js';
import { isParticipantRef } from './participants.js';
/** The caps that make rendering a sandbox's output a bounded promise. */
export const MESSAGE_BLOCK_LIMITS = {
    maxBlocks: 64,
    maxDepth: 3,
    maxText: 64 * 1024,
    maxRows: 64,
    maxActions: 12
};
/** The longest block id the validator accepts; a host's uuid is 36. */
export const BLOCK_ID_MAX_LENGTH = 64;
const finding = (path, message, fix) => ({
    path,
    message,
    fix,
});
/**
 * Validate a candidate block tree. Empty findings = renderable. Total, never
 * throws — the host refuses a write on findings rather than crashing on one.
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
    /** The two form fields (`FormBlockFields`): an optional id, an optional participant reference. */
    const formFields = (b, p) => {
        if (b.id !== undefined && (typeof b.id !== 'string' || !b.id || b.id.length > BLOCK_ID_MAX_LENGTH))
            f.push(finding(`${p}.id`, 'is not a block id', 'omit it — the host stamps one at the write'));
        if (b.addressee !== undefined && !isParticipantRef(b.addressee))
            f.push(finding(`${p}.addressee`, 'is not a participant reference', "address the form to 'character:<id>', 'envoy:<slug>', 'owner' or 'user:<id>', or omit it"));
        if (b.question !== undefined)
            str(b.question, `${p}.question`, 'question');
        else if (b.addressee !== undefined)
            f.push(finding(`${p}.question`, 'is missing on an addressed form', 'say what is being asked — the addressee (or the oracle answering for them) needs the question'));
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
 * The identity is `<spec id>#<key>` for the ONE action of `spec` whose
 * `function` is the block's `fn`. A block whose `fn` the spec declares no
 * action for, or several, is left unstamped — it fires as legacy and gets the
 * owner floor — rather than guessed; and a block that already carries an
 * `action` keeps it, so a spec may name a declaration of another spec's on
 * purpose. Returns a copy; the input is never mutated.
 */
export function stampBlockActions(blocks, spec) {
    const byFunction = new Map();
    for (const a of actionsOf(spec)) {
        const list = byFunction.get(a.function) ?? [];
        list.push(`${spec.id}#${a.key}`);
        byFunction.set(a.function, list);
    }
    const identityFor = (fn) => {
        const found = byFunction.get(fn);
        return found && found.length === 1 ? found[0] : undefined;
    };
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
/**
 * Every `choices` and `form` block in a tree, in render order, groups
 * flattened — the blocks a fire, an event or an answer can name.
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
/** The form block carrying `id`, or undefined. */
export function findFormBlock(blocks, id) {
    return formBlocksOf(blocks).find((b) => b.id === id);
}
/**
 * Every function a `choices` option or a `form` names, deduplicated — what
 * the writing spec must declare an action for. A block whose `fn` the spec
 * declares no action for is refused at the write: nothing would ever be held
 * to an audience for it.
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
 * the function named).
 */
export function undeclaredBlockFunctions(blocks, spec) {
    const declared = new Set(actionsOf(spec).map((a) => a.function));
    return blockFunctionsOf(blocks).filter((fn) => !declared.has(fn));
}
/**
 * The effects line (plans/29 R-15 *The line*; 09-B F39): a block naming a
 * `world` action — one whose result touches cards, lorebooks, settings,
 * permissions, connections — is refused. Such an action lives in the
 * composer or the review gate and is owner-only; a message carrying it would
 * put an out-of-fiction effect where a character could be asked to answer
 * it. Returns the functions of the offending actions.
 */
export function worldBlockFunctions(blocks, spec) {
    const world = new Set(actionsOf(spec)
        .filter((a) => effectsOf(a) === 'world')
        .map((a) => a.function));
    return blockFunctionsOf(blocks).filter((fn) => world.has(fn));
}
/**
 * Stamp an `id` on every `choices` and `form` block that has none — the
 * host's half, at the write, with the host's id maker (a uuid). A block that
 * already carries one keeps it. Returns a copy; the input is never mutated.
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
/**
 * The JSON Schema an oracle answers a form against (R-15: "an oracle with
 * `json` capability answers against the form's schema").
 *
 *  - `choices` → `{ choice: <enum of the option keys> }`, required.
 *  - `form` → the field schema, mapped field by field (`fieldsToJsonSchema`).
 *
 * A `choices` block whose options carry no keys yields an empty enum, which
 * is what the validator refuses on an addressed block before it is written.
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