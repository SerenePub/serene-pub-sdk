/**
 * Plugin settings — the schema an extension declares, and the four things core does
 * with it (12 §6).
 *
 * 12 §6 promises "the same schema strategy as node config and review steps — one
 * renderer, three uses." That promise is only real if it is literally the same
 * declaration, so `FieldDecl` here is the same shape node `params` use, plus the two
 * fields that only mean something for plugin settings (`scope`, `side`). An extension
 * author who has written a node's `params` schema already knows this one.
 *
 * One declaration, four uses:
 *
 *   1. **The form** core renders in plugin settings — no UI work by the author.
 *   2. **Validation** of stored values, on save and on update.
 *   3. **The manifest entry**, extracted statically by the compiler — never by running
 *      the author's code (F6, 03 §3).
 *   4. **Typed access** from the extension's own hooks: `settings.values` is inferred,
 *      so `apiKey` is a `SecretValue` and a mistyped key does not compile.
 *
 * ## The `secret` field, and why it is typed
 *
 * The ruling that produced this reads backwards at first. "SP declines custody of plugin
 * secrets" sounds safer than storing them — but an extension keeping credentials in its
 * own data directory has no key and no crypto facility, so the realistic outcome is
 * plaintext on the user's disk, unencrypted *and* unauditable. Declining custody produced
 * the worse result (13 §6).
 *
 * What makes accepting it defensible is that the field is **typed**, which is what lets
 * core mechanically redact it from receipts (F16), exclude it from export (12 §7) and
 * keep it write-only in the UI. A free-form column cannot tell a key from a note.
 */
export const secret = (value) => ({ $secret: true, value });
export const isSecret = (v) => !!v && typeof v === 'object' && v.$secret === true;
/** The label to render, from whichever key the author used. */
export function fieldLabel(decl) {
    return decl.label ?? decl.i18n;
}
/** The media kinds a `media` field offers. Images unless it says otherwise. */
export function fieldAccepts(decl) {
    return decl.accepts?.length ? decl.accepts : ['image'];
}
// ── Declaration-time checks ─────────────────────────────────────────────────
/**
 * A nested declaration's mistakes, reported at the path they live at.
 *
 * `list` and `object` make a schema a tree, and a finding that named only the
 * top-level key would send an author looking at the wrong declaration. The path
 * is the address a reader can follow: `blocks[].id`, `layout.columns[]`.
 *
 * ⚠ **A `secret` may not be nested**, and this is the guard for it rather than a
 * documented caution. Redaction is flat everywhere it happens — `forClient`,
 * `forExport` and `forOwningHook` all walk the schema's own keys and switch on
 * `type === 'secret'` — so a credential inside a list would be exported, sent to
 * the browser, and written into a receipt with nothing anywhere saying so. The
 * refusal is at declaration time, which is the only place it is cheap.
 */
function checkNested(decl, path) {
    const f = [];
    if (decl.type === 'secret')
        f.push({
            field: path,
            severity: 'error',
            message: `'${path}' is a secret nested inside a list or object`,
            fix: 'declare it as a top-level field — redaction, export and receipts read the schema flat, so a nested secret would leak',
        });
    if (decl.type === 'list') {
        if (!decl.item)
            f.push({
                field: path,
                severity: 'error',
                message: `'${path}' is a list with no element declaration`,
                fix: "declare `item: { type: 'string' }` — a list whose elements are undeclared cannot be rendered or checked",
            });
        else
            f.push(...checkNested(decl.item, `${path}[]`));
    }
    if (decl.type === 'object') {
        if (!decl.fields || !Object.keys(decl.fields).length)
            f.push({
                field: path,
                severity: 'error',
                message: `'${path}' is an object with no member declarations`,
                fix: 'declare `fields: { … }` — a free-form map is `text` with `format: "json"`',
            });
        else
            for (const [k, member] of Object.entries(decl.fields))
                f.push(...checkNested(member, `${path}.${k}`));
    }
    if (decl.type === 'enum' && !decl.of?.length && !decl.members?.length && !decl.from)
        f.push({
            field: path,
            severity: 'error',
            message: `'${path}' is an enum with no options`,
            fix: "declare `of: ['a','b'] as const`, or source them from the connection with `from`",
        });
    return f;
}
/** Mistakes that would otherwise become silent leaks or dead form fields. */
export function checkSchema(schema) {
    const f = [];
    for (const [key, d] of Object.entries(schema)) {
        // The tree below a `list` or an `object`, checked at its own address.
        // The top-level cases below stay as they are: they are about the
        // *field*, not the element, and two of them (`scope`, `side`) have no
        // meaning inside a row.
        if (d.type === 'list' || d.type === 'object')
            f.push(...checkNested(d, key));
        if (d.type === 'secret') {
            if (d.side === 'component') {
                f.push({
                    field: key,
                    severity: 'error',
                    message: `'${key}' is a secret declared component-side`,
                    fix: 'a component runs in the browser, so the value would be delivered to the client — declare it extension-side',
                });
            }
            if (d.default !== undefined) {
                f.push({
                    field: key,
                    severity: 'error',
                    message: `'${key}' is a secret with a default`,
                    fix: 'remove it — a shipped default credential is not a credential',
                });
            }
        }
        if (d.type === 'enum' && !d.of?.length && !d.from) {
            f.push({
                field: key,
                severity: 'error',
                message: `'${key}' is an enum with no options`,
                fix: "declare `of: ['a','b'] as const`, or source them from the connection with `from`",
            });
        }
        if (d.required && d.default !== undefined) {
            f.push({
                field: key,
                severity: 'warning',
                message: `'${key}' is required and has a default, so it can never be unset`,
                fix: 'drop `required`, or drop the default if the admin genuinely has to choose',
            });
        }
        if (d.showIf && !schema[d.showIf.field]) {
            f.push({
                field: key,
                severity: 'error',
                message: `'${key}' is shown conditionally on '${d.showIf.field}', which is not a field`,
                fix: `name a field this schema declares (${Object.keys(schema).join(', ')})`,
            });
        }
    }
    return f;
}
// ── Value validation ────────────────────────────────────────────────────────
/**
 * One value against one declaration, at the address it lives at.
 *
 * Extracted from `checkValues`'s loop so a `list`'s elements and an `object`'s
 * members are checked by the same rules as a top-level field — a second copy of
 * "an integer is whole and within its range" is a second set of rules to keep
 * in step, and the first divergence is a stored value one layer accepts and the
 * other refuses.
 */
function checkOne(decl, value, path) {
    const f = [];
    const bad = (why, fix) => f.push({ field: path, severity: 'error', message: `'${path}' ${why}`, fix });
    switch (decl.type) {
        case 'secret':
            if (!isSecret(value))
                bad('is not a secret value', 'write it through the settings form; secrets are never set as plain strings');
            break;
        case 'boolean':
            if (typeof value !== 'boolean')
                bad(`should be a boolean, got ${typeof value}`, 'store true or false');
            break;
        case 'integer':
        case 'number': {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                bad(`should be a number, got ${typeof value}`, 'store a number');
                break;
            }
            if (decl.type === 'integer' && !Number.isInteger(value))
                bad('should be a whole number', 'round it, or declare the field as `number`');
            if (decl.min !== undefined && value < decl.min)
                bad(`is below the minimum ${decl.min}`, `use a value ≥ ${decl.min}`);
            if (decl.max !== undefined && value > decl.max)
                bad(`is above the maximum ${decl.max}`, `use a value ≤ ${decl.max}`);
            break;
        }
        case 'enum':
            // `decl.of` only, deliberately: a `members`-declared enum has never
            // been checked here, and starting to check it is a tightening this
            // extension has no business making.
            if (decl.of && !decl.of.includes(value))
                bad(`is not one of ${decl.of.join(', ')}`, `use one of: ${decl.of.join(', ')}`);
            break;
        case 'string[]':
            if (!Array.isArray(value))
                bad('should be a list of strings', 'store an array');
            break;
        case 'list': {
            if (!Array.isArray(value)) {
                bad('should be a list', 'store an array — the order is part of the value');
                break;
            }
            // `min`/`max` are the element COUNT on a list, not a numeric range.
            if (decl.min !== undefined && value.length < decl.min)
                bad(`has fewer than ${decl.min} entries`, `keep at least ${decl.min}`);
            if (decl.max !== undefined && value.length > decl.max)
                bad(`has more than ${decl.max} entries`, `keep at most ${decl.max}`);
            if (decl.item)
                for (let i = 0; i < value.length; i++)
                    f.push(...checkOne(decl.item, value[i], `${path}[${i}]`));
            break;
        }
        case 'object': {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                bad('should be an object', 'store a record of the declared members');
                break;
            }
            const row = value;
            for (const [k, member] of Object.entries(decl.fields ?? {})) {
                const mv = row[k];
                if (mv === undefined || mv === null) {
                    if (member.required && member.default === undefined)
                        f.push({
                            field: `${path}.${k}`,
                            severity: 'error',
                            message: `'${path}.${k}' is required and not set`,
                            fix: 'fill it in — the row is incomplete without it',
                        });
                    continue;
                }
                f.push(...checkOne(member, mv, `${path}.${k}`));
            }
            break;
        }
        default:
            if (typeof value !== 'string')
                bad(`should be a string, got ${typeof value}`, 'store a string');
    }
    return f;
}
export function checkValues(schema, values) {
    const f = [];
    for (const [key, d] of Object.entries(schema)) {
        const v = values[key];
        if (v === undefined || v === null) {
            if (d.required && d.default === undefined) {
                f.push({
                    field: key,
                    severity: 'error',
                    message: `'${key}' is required and not set`,
                    fix: `set it in plugin settings — the plugin stays installed and listed until then, it is not broken`,
                });
            }
            continue;
        }
        f.push(...checkOne(d, v, key));
    }
    return f;
}
/**
 * What an update does to values that already exist.
 *
 * The rule is the one 12 §5 already applies to a node swap's orphaned slots: **unmigrated
 * values land in diagnostics rather than disappearing.** An author who renames a field
 * and an admin who then downgrades should both get their data back; silently dropping it
 * makes the update irreversible in the one direction that matters.
 */
export function reconcile(schema, stored) {
    const values = {};
    const orphaned = [];
    for (const [key, d] of Object.entries(schema)) {
        values[key] = key in stored ? stored[key] : d.default;
    }
    for (const [key, value] of Object.entries(stored)) {
        if (key in schema)
            continue;
        orphaned.push({
            field: key,
            value: isSecret(value) ? '[secret]' : value,
            reason: 'the updated schema no longer declares this field',
        });
    }
    return { values, orphaned, findings: checkValues(schema, values) };
}
// ── The three audiences ─────────────────────────────────────────────────────
/** What the settings form sends back. A secret reports only whether it is set. */
export function forClient(schema, values) {
    const out = {};
    for (const [key, d] of Object.entries(schema)) {
        out[key] = d.type === 'secret' ? { $secretSet: isSecret(values[key]) } : values[key];
    }
    return out;
}
/** What an export carries. Secrets never leave, on the same footing as credentials. */
export function forExport(schema, values) {
    const out = {};
    for (const [key, d] of Object.entries(schema)) {
        if (d.type === 'secret')
            continue;
        out[key] = values[key];
    }
    return out;
}
/**
 * What the declaring extension's own hook receives — the only place plaintext appears,
 * and only for the extension that owns the field. Same shape as F18's per-call injection
 * of connection material.
 */
export function forOwningHook(schema, values, decrypt) {
    const out = {};
    for (const [key, d] of Object.entries(schema)) {
        const v = values[key];
        out[key] = d.type === 'secret' && isSecret(v) ? decrypt(v.value) : v;
    }
    return out;
}
/** What a component receives at render — extension-side fields never reach the browser. */
export function forComponent(schema, values) {
    const out = {};
    for (const [key, d] of Object.entries(schema)) {
        if (d.side !== 'component')
            continue;
        out[key] = values[key];
    }
    return out;
}
export function configState(schema, values) {
    const missing = Object.entries(schema)
        .filter(([k, d]) => d.required && d.default === undefined && (values[k] === undefined || values[k] === null))
        .map(([k]) => k);
    if (!missing.length)
        return { state: 'ready' };
    return {
        state: 'needs-configuration',
        missing,
        message: `waiting on ${missing.join(', ')} in plugin settings`,
    };
}
/** Declaration order within a group; group order is first appearance. */
export function formLayout(schema) {
    const groups = [];
    for (const [key, decl] of Object.entries(schema)) {
        const name = decl.group ?? 'General';
        let g = groups.find((x) => x.group === name);
        if (!g)
            groups.push((g = { group: name, fields: [] }));
        g.fields.push({ key, decl });
    }
    return groups;
}
/** Is this field currently shown, given the values? One level of `showIf`, no rules engine. */
export const isVisible = (decl, values) => !decl.showIf || values[decl.showIf.field] === decl.showIf.equals;
export class SettingsError extends Error {
}
/**
 * Declare a plugin's settings. The compiler extracts this statically into the manifest,
 * so it must be a literal — a schema assembled at runtime cannot be read without running
 * the author's code, which the packager never does (F6, 03 §3).
 */
export function defineSettings(schema) {
    const errs = checkSchema(schema).filter((x) => x.severity === 'error');
    if (errs.length) {
        throw new SettingsError('invalid settings schema:\n' + errs.map((e) => `  ${e.message}\n    → ${e.fix}`).join('\n'));
    }
    return {
        schema,
        defaults: () => Object.fromEntries(Object.entries(schema)
            .filter(([, d]) => d.default !== undefined)
            .map(([k, d]) => [k, d.default])),
        layout: () => formLayout(schema),
        check: (v) => checkValues(schema, v),
        reconcile: (v) => reconcile(schema, v),
        state: (v) => configState(schema, v),
        forClient: (v) => forClient(schema, v),
        forExport: (v) => forExport(schema, v),
        forComponent: (v) => forComponent(schema, v),
        forOwningHook: (v, d) => forOwningHook(schema, v, d),
    };
}
/** Back-compat alias for the earlier name. */
export const validateSettingsSchema = (s) => checkSchema(s).map((f) => f.message);
// ── Forms from data (review pauses, arbitrary extension forms) ──────────────
const humanize = (key) => key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
/**
 * A `SettingsSchema` inferred from a payload — the review gate's form producer.
 *
 * One field language for everything a person edits in a generated form: an
 * extension's declared settings, an extension's arbitrary forms, and a paused
 * node's payload all render through the same schema and the same renderer. A
 * review form is therefore 100% defined by the data the node received: a
 * string is a text field, a number is a number field, a flag is a checkbox,
 * and structure a form cannot decompose arrives as JSON rather than being
 * silently dropped — an edit surface that hides part of the payload is a
 * review gate a write can sneak past.
 */
export function inferSchema(payload) {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : { value: payload };
    const schema = {};
    for (const [key, v] of Object.entries(source)) {
        const label = humanize(key);
        if (typeof v === 'string') {
            schema[key] = {
                type: v.length > 80 || v.includes('\n') ? 'text' : 'string',
                label,
            };
        }
        else if (typeof v === 'number') {
            schema[key] = { type: Number.isInteger(v) ? 'integer' : 'number', label };
        }
        else if (typeof v === 'boolean') {
            schema[key] = { type: 'boolean', label };
        }
        else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
            schema[key] = { type: 'string[]', label };
        }
        else {
            schema[key] = { type: 'text', label, format: 'json' };
        }
    }
    return schema;
}
/** The payload as form values — JSON-format fields serialized for editing. */
export function valuesForForm(schema, payload) {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : { value: payload };
    const out = {};
    for (const [key, decl] of Object.entries(schema)) {
        const v = source[key];
        out[key] = decl.format === 'json' ? JSON.stringify(v ?? null, null, 2) : v;
    }
    return out;
}
/**
 * Fold edited form values back into the payload shape the node expects.
 *
 * The inverse of `valuesForForm`: JSON-format fields parse back (an
 * unparseable edit throws with the field named rather than committing a
 * string where an object stood), untouched keys keep their original values —
 * a form is an edit surface, never a filter.
 */
export function applyFormValues(schema, payload, edited) {
    const wrapped = !(payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload));
    const base = wrapped
        ? { value: payload }
        : { ...payload };
    for (const [key, decl] of Object.entries(schema)) {
        if (!(key in edited))
            continue;
        const v = edited[key];
        if (decl.format === 'json') {
            try {
                base[key] = JSON.parse(String(v));
            }
            catch {
                throw new SettingsError(`'${key}' is not valid JSON — the field holds structure the form ` +
                    `cannot decompose, so it must parse before it can be committed.`);
            }
        }
        else if (decl.type === 'number' || decl.type === 'integer') {
            const n = typeof v === 'number' ? v : Number(v);
            if (Number.isNaN(n))
                throw new SettingsError(`'${key}' must be a number.`);
            base[key] = decl.type === 'integer' ? Math.trunc(n) : n;
        }
        else if (decl.type === 'boolean') {
            base[key] = !!v;
        }
        else if (decl.type === 'string[]') {
            base[key] = Array.isArray(v)
                ? v.map(String)
                : String(v ?? '')
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean);
        }
        else {
            base[key] = String(v ?? '');
        }
    }
    return wrapped ? base['value'] : base;
}
//# sourceMappingURL=settings.js.map