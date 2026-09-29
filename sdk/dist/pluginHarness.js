/**
 * The **plugin sandbox's context, in the author's harness** (plans 29 §14 D-3).
 *
 * The SDK's executor builds a node's context itself — `{ signal, progress,
 * status, log, countTokens }`, plus `read` for a Query, `call` for an Oracle and
 * `commit` for an Outlet. That is the context a **core** handler runs against,
 * and it is *not* the one a **plugin's** handler ever sees. At install a
 * plugin's node handlers do not go through that path at all: the app's
 * `pipelines/runtime/pluginBindings.ts` calls `RuntimeManager.callHook`, which
 * runs the hook inside the plugin's sandbox against a context the sandbox
 * builds — `{ random, now, log, storage, fetch, signal }` — and commits its rows
 * afterwards.
 *
 * Two packages paid for that gap before it was written down:
 *
 *  - **Twenty Questions shipped a dead Query.** Its `ctx.read` worked in the
 *    harness, because the executor endows `read` for every Query whoever wrote
 *    it. No sandbox endows it, so the query would have read nothing at install.
 *  - **Battleship had to write its own fake store.** Nothing in the harness
 *    endows `ctx.storage`, so a package whose whole point is that one handler
 *    reads back what another wrote could not run its own handlers without
 *    hand-wrapping every binding.
 *
 * So this module endows the *sandbox's* surface, and endows **only** that: a
 * plugin Query's `ctx.read` is `undefined` here exactly as it is at install, and
 * a test written against it fails the way the install would. The executor's own
 * conveniences — `progress`, `status`, `countTokens`, `iteration`, `scripts` —
 * are absent for the same reason: no sandbox has ever defined them.
 *
 * ⚠ **Not the real sandbox.** No opaque origin, no worker, no QuickJS, no
 * membrane; the handler runs in this process with ordinary references. What is
 * reproduced is the *shape* — which members exist, which are withheld, what a
 * refusal says, and where the randomness and the clock come from — because that
 * is what a handler can be written against and get wrong.
 */
import { getDefinition } from './descriptors.js';
import { err, ok } from './executor.js';
// ── The grant table (plans 29 R-3) ──────────────────────────────────────────
// Lives in `hookGrants.ts`, the one copy the sandboxes, the harness and the
// guide all read (K1c); re-exported here so the harness's API is unchanged.
import { hookCtxGrants } from './hookGrants.js';
export { HOOK_CTX_KINDS, hookCtxGrants, hookCtxKeysFor, isHookCtxKind } from './hookGrants.js';
/** A node kind, as a descriptor spells it, read as the hook ctx kind it dispatches under. */
const CTX_KIND_OF_NODE = {
    task: 'task',
    query: 'query',
    oracle: 'oracle',
    outlet: 'outlet',
};
// ── Randomness and the clock ────────────────────────────────────────────────
/**
 * The sandbox's RNG — xfnv1a over the seed label, then mulberry32.
 *
 * ⚠ **Not `seededRandom`.** The executor's RNG (executor.ts) is a different
 * algorithm over a different seed, and the two produce different streams from
 * the same word. That is a fact about the two codebases, not a design: a plugin
 * handler's rolls come from the *sandbox's* stream, so a golden over a handler
 * that rolls is only reproducible against this one. Kept byte-for-byte in step
 * with `buildProgram` in the app's `QuickJsSandbox.ts` / `SesWorkerSandbox.ts`.
 * @experimental
 */
export function pluginSeededRandom(label) {
    let h = 1779033703 ^ label.length;
    for (let i = 0; i < label.length; i++) {
        h = Math.imul(h ^ label.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    let a = (h ^= h >>> 16) >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * djb2 over the serialized input — the app's per-call address, so the seed
 * label a harness composes is the label an install composes (`pluginBindings.ts`).
 * @experimental
 */
export function inputDigest(v) {
    let s;
    try {
        s = JSON.stringify(v) ?? '';
    }
    catch {
        s = '';
    }
    let h = 5381;
    for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
/**
 * The seed label a plugin node handler's RNG is derived from, as the app
 * composes it: the run seed, the pin, and a digest of the exact input — so
 * replays roll the same and two same-typed nodes in one run (or one node under
 * `each`) get distinct streams without depending on completion order.
 * @experimental
 */
export const nodeSeedLabel = (seed, pin, input) => `${seed}:node:${pin}:${inputDigest(input)}`;
// ── ctx.log, as the prelude formats it ──────────────────────────────────────
const LOG_DETAIL_MAX = 2000;
const isLogLevel = (v) => v === 'debug' || v === 'info' || v === 'warn' || v === 'error';
/**
 * One argument, rendered the way the sandbox prelude's `__fmtLog` renders it:
 * a string reads bare, anything else keeps its quotes and braces, and a value
 * JSON has no form for says so in words rather than vanishing.
 *
 * ⚠ One divergence from the prelude, stated rather than hidden: a circular
 * value renders as `[unserializable]` here where the prelude walks the object
 * and writes `[circular]` at the offending edge. Both refuse to throw and both
 * keep the line; only the wording of that one case differs.
 */
function renderLogArg(v, bare) {
    if (bare && typeof v === 'string')
        return v;
    if (v === undefined)
        return 'undefined';
    const t = typeof v;
    if (t === 'function')
        return '[function]';
    if (t === 'bigint')
        return `${String(v)}n`;
    if (t === 'symbol')
        return String(v);
    if (t === 'number' && !Number.isFinite(v))
        return String(v);
    let out;
    try {
        out = JSON.stringify(v, (_k, val) => val instanceof Error ? { name: val.name, message: val.message } : val);
    }
    catch {
        out = undefined;
    }
    if (out === undefined)
        out = '[unserializable]';
    return out.length > LOG_DETAIL_MAX
        ? `${out.slice(0, LOG_DETAIL_MAX)}...(+${out.length - LOG_DETAIL_MAX} more chars)`
        : out;
}
/** The prelude's `__fmtLog`: `[level] message detail…`, or `[log] …`. @experimental */
export function formatHookLog(args) {
    if (args.length > 1 && isLogLevel(args[0]))
        return (`[${args[0]}] ` +
            [renderLogArg(args[1], true), ...args.slice(2).map((a) => renderLogArg(a, false))].join(' '));
    if (!args.length)
        return '[log]';
    return `[log] ${args.map((a) => renderLogArg(a, true)).join(' ')}`;
}
// ── The in-memory ExtensionStorage ──────────────────────────────────────────
/**
 * The row half of the grant, as a fraction of it — mirrors `rowQuotaFor` in the
 * app's `storageHost.ts`, which is the arithmetic the sandbox actually applies.
 * Rows live in the database and files on disk; one budget is what an author can
 * reason about, and the sub-cap is what stops a plugin putting megabytes in the
 * database.
 * @experimental
 */
export function rowQuotaFor(quotaBytes) {
    if (!Number.isFinite(quotaBytes) || quotaBytes <= 0)
        return 64 * 1024;
    return Math.min(Math.floor(quotaBytes), Math.max(64 * 1024, Math.min(1024 * 1024, Math.floor(quotaBytes / 8))));
}
/** The grant a sandbox falls back to when the manifest declares none. @experimental */
export const DEFAULT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;
/**
 * The clock this harness pins when a caller names none.
 *
 * Deliberately the same instant as `EXAMPLE_CLOCK` in `testing.ts`, so a
 * handler run inside an executed example and the same handler run in a unit
 * test report the same `ctx.now()` — a golden that moved between the two would
 * be a golden nobody keeps. Defined here rather than imported because
 * `testing.ts` re-exports this module, and a test pins that the two agree.
 * @experimental
 */
export const HARNESS_CLOCK = 1_700_000_000_000;
const utf8 = (s) => new TextEncoder().encode(s).length;
/**
 * An in-memory `ExtensionStorage` — the half the SDK's harness cannot otherwise
 * supply, with the refusals install actually makes.
 *
 * Faithful in the ways a handler can depend on: `get` answers `undefined` for a
 * key nobody wrote; a row costs its key as well as its value; a write past the
 * row budget or the whole grant comes back as `err` rather than throwing, and
 * comes back **whole** so a handler that prunes and retries can; a key that is
 * not a key, and a value JSON cannot carry, throw with the sandbox's sentence.
 *
 * ⚠ Not faithful about: transactions (install commits a call's rows together,
 * this writes as it goes), the database, and the bytes a row costs on disk.
 * What it does reproduce is the one property a package like Battleship exists
 * to demonstrate — a row one handler writes is a row the next handler reads.
 *
 * **Isolation is structural.** One call is one namespace; two plugins get two
 * calls and neither can name the other's keys, because there is no shared map
 * to name them in.
 * @experimental
 */
export function memoryStorage(opts = {}) {
    const quotaBytes = opts.quotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES;
    const rowQuotaBytes = opts.rowQuotaBytes ?? rowQuotaFor(quotaBytes);
    const now = opts.now ?? (() => HARNESS_CLOCK);
    const stamp = () => new Date(Math.floor(now())).toISOString();
    const rows = new Map();
    const files = new Map();
    let writes = 0;
    const jsonOf = (v) => {
        let s;
        try {
            s = JSON.stringify(v === undefined ? null : v);
        }
        catch {
            s = undefined;
        }
        if (typeof s !== 'string')
            throw new Error('storage: a row value must be JSON-serializable');
        return s;
    };
    const rowKey = (key) => {
        if (typeof key !== 'string' || key.length === 0)
            throw new Error('storage: a row key is required');
        if (key.length > 512)
            throw new Error('storage: a row key may not exceed 512 characters');
        return key;
    };
    const rowSize = (key, json) => utf8(key) + utf8(json);
    const rowTotal = () => [...rows.values()].reduce((n, r) => n + r.bytes, 0);
    const fileTotal = () => [...files.values()].reduce((n, f) => n + f.bytes.byteLength, 0);
    const usageFrom = (rowBytes, fileBytes) => ({
        quotaBytes,
        usedBytes: rowBytes + fileBytes,
        availableBytes: Math.max(0, quotaBytes - rowBytes - fileBytes),
        rowBytes,
        fileBytes,
    });
    const usage = () => usageFrom(rowTotal(), fileTotal());
    const receipt = (deltaBytes) => ok({ deltaBytes, usage: usage() });
    /** A relative path, jailed the way the host jails one: `..` is refused, never normalised. */
    const filePath = (rel) => {
        if (typeof rel !== 'string' || rel.length === 0)
            throw new Error('storage: a path is required');
        const parts = rel.split('/').filter((p) => p !== '' && p !== '.');
        if (rel.startsWith('/') || parts.some((p) => p === '..'))
            throw new Error('storage: path escapes the extension directory');
        return parts.join('/');
    };
    const fileEntry = (path, f) => ({
        path,
        bytes: f.bytes.byteLength,
        updatedAt: f.updatedAt,
    });
    const extensionFiles = {
        list: async (prefix) => [...files.entries()]
            .filter(([p]) => !prefix || p.startsWith(prefix))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([p, f]) => fileEntry(p, f)),
        stat: async (path) => {
            const p = filePath(path);
            const f = files.get(p);
            return f ? fileEntry(p, f) : null;
        },
        read: async (path) => {
            const f = files.get(filePath(path));
            return f ? ok(new Uint8Array(f.bytes)) : err('storage: not found');
        },
        write: async (path, bytes) => {
            const p = filePath(path);
            const incoming = bytes?.byteLength ?? 0;
            const existing = files.get(p)?.bytes.byteLength ?? 0;
            if (rowTotal() + fileTotal() - existing + incoming > quotaBytes)
                return err('storage: quota exceeded');
            files.set(p, { bytes: new Uint8Array(bytes ?? []), updatedAt: stamp() });
            return ok({ deltaBytes: incoming - existing, usage: usage() });
        },
        delete: async (path) => {
            const p = filePath(path);
            const freed = files.get(p)?.bytes.byteLength ?? 0;
            files.delete(p);
            return receipt(-freed);
        },
        deleteAll: async (prefix) => {
            const doomed = [...files.keys()].filter((p) => !prefix || p.startsWith(prefix));
            for (const p of doomed)
                files.delete(p);
            return ok({ removed: doomed.length, usage: usage() });
        },
    };
    const store = {
        get writes() {
            return writes;
        },
        snapshot: () => Object.fromEntries([...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, r]) => [k, r.value])),
        usage: async () => usage(),
        get: async (key) => rows.get(rowKey(key))?.value,
        keys: async (prefix) => {
            const p = prefix ?? '';
            return [...rows.keys()].filter((k) => k.startsWith(p)).sort();
        },
        query: async (q = {}) => {
            const p = q.prefix ?? '';
            const since = q.since == null ? NaN : Date.parse(q.since);
            const until = q.until == null ? NaN : Date.parse(q.until);
            const want = Math.floor(Number(q.limit));
            const limit = Math.max(1, Math.min(200, Number.isFinite(want) && want > 0 ? want : 50));
            const order = q.order === 'oldest' || q.order === 'key' ? q.order : 'newest';
            const all = [];
            for (const [key, r] of rows) {
                if (!key.startsWith(p))
                    continue;
                const t = Date.parse(r.updatedAt);
                if (!Number.isNaN(since) && !(t >= since))
                    continue;
                if (!Number.isNaN(until) && !(t < until))
                    continue;
                all.push({ key, value: r.value, bytes: r.bytes, updatedAt: r.updatedAt });
            }
            all.sort((a, b) => {
                if (order !== 'key') {
                    const ta = Date.parse(a.updatedAt);
                    const tb = Date.parse(b.updatedAt);
                    if (ta !== tb)
                        return order === 'oldest' ? ta - tb : tb - ta;
                }
                return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
            });
            // An offset cursor. One it cannot read throws rather than silently
            // restarting at zero, which is how a pager becomes an infinite loop.
            let start = 0;
            if (q.cursor != null) {
                const c = String(q.cursor);
                if (!/^o:[0-9]+$/.test(c))
                    throw new Error('storage: unreadable cursor');
                start = parseInt(c.slice(2), 10);
            }
            const page = { rows: all.slice(start, start + limit) };
            if (start + limit < all.length)
                page.nextCursor = `o:${start + limit}`;
            return page;
        },
        put: async (key, value) => {
            writes++;
            const k = rowKey(key);
            const json = jsonOf(value);
            const size = rowSize(k, json);
            const prev = rows.get(k);
            const delta = size - (prev?.bytes ?? 0);
            const before = rowTotal();
            // Two ceilings, checked in the order the sandbox checks them, so a
            // handler that publishes the refusal publishes the same sentence.
            if (before + delta > rowQuotaBytes)
                return err('storage: the row budget is full');
            const fileBytes = fileTotal();
            if (before + fileBytes + delta > quotaBytes)
                return err('storage: quota exceeded');
            // Re-parsed, not stored by reference: at install the value crosses a
            // JSON boundary, so a handler mutating the object it put must not be
            // able to change what the store holds.
            rows.set(k, { value: JSON.parse(json), bytes: size, updatedAt: stamp() });
            return ok({ deltaBytes: delta, usage: usageFrom(before + delta, fileBytes) });
        },
        delete: async (key) => {
            const k = rowKey(key);
            const prev = rows.get(k);
            if (!prev)
                return receipt(0);
            rows.delete(k);
            return receipt(-prev.bytes);
        },
        deleteAll: async (prefix) => {
            const p = prefix ?? '';
            const doomed = [...rows.keys()].filter((k) => k.startsWith(p));
            for (const k of doomed)
                rows.delete(k);
            return ok({ removed: doomed.length, usage: usage() });
        },
        files: extensionFiles,
    };
    for (const [key, value] of Object.entries(opts.seed ?? {})) {
        const json = jsonOf(value);
        rows.set(rowKey(key), { value: JSON.parse(json), bytes: rowSize(key, json), updatedAt: stamp() });
    }
    return store;
}
// ── ctx.fetch, with its refusals ────────────────────────────────────────────
/**
 * Does an allowlist entry cover this host and port? The authoring grammar is
 * `host`, `*.suffix` or `*`, each with an optional `:port`; a bare host or
 * wildcard reaches only the default web ports. Mirrors `matchAllow` in the
 * app's `fetchHost.ts`.
 */
function matchAllow(allow, reqHost, reqPort) {
    const host = String(reqHost).toLowerCase();
    for (const entry of allow) {
        const raw = String(entry ?? '').toLowerCase();
        if (!raw)
            continue;
        let entryHost = raw;
        let entryPort = null;
        // A trailing ":<digits>" is a port; skip the split for IPv6 (which has
        // its own colons) so "::1" is not mis-parsed as host ":" + port "1".
        const ci = raw.lastIndexOf(':');
        if (ci > 0 && /^\d+$/.test(raw.slice(ci + 1)) && raw.slice(0, ci).indexOf(':') < 0) {
            entryHost = raw.slice(0, ci);
            entryPort = Number(raw.slice(ci + 1));
        }
        let hostOk;
        if (entryHost === '*')
            hostOk = true;
        else if (entryHost.startsWith('*.')) {
            // "*.example.com" matches any sub-domain, but NOT the apex.
            const suffix = entryHost.slice(1);
            hostOk = host.length > suffix.length && host.slice(-suffix.length) === suffix;
        }
        else
            hostOk = host === entryHost;
        if (!hostOk)
            continue;
        if (entryPort !== null) {
            if (reqPort === entryPort)
                return entryHost;
        }
        else if (entryHost === 'localhost' || isIpLiteral(entryHost)) {
            // A deliberate internal grant — any port on that literal target.
            return entryHost;
        }
        else if (reqPort === 80 || reqPort === 443) {
            // A bare host/wildcard grant reaches only the default web ports.
            return entryHost;
        }
    }
    return null;
}
const isIpLiteral = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
/**
 * Build the context a plugin's handler runs against at install.
 *
 * The one-liner `examples/fixtures.ts` in a plugin repo should not have to
 * write: pass it to a handler and the handler sees what the sandbox gives it,
 * including the absences.
 * @experimental
 */
export function pluginHandlerContext(opts) {
    const base = opts.kind ? hookCtxGrants(opts.kind) : { storage: true, fetch: true };
    const grants = {
        storage: opts.grants?.storage ?? base.storage,
        fetch: opts.grants?.fetch ?? base.fetch,
    };
    const nowMs = Math.floor(opts.now ?? HARNESS_CLOCK);
    const random = pluginSeededRandom(opts.seed ?? `${opts.pluginId}:harness`);
    const logs = opts.logs;
    // Built in the sandbox's own order, because `hookCtxKeysFor` is what a test
    // compares `Object.keys(ctx)` against and an order nobody decided would make
    // that comparison an accident.
    const ctx = {
        random,
        now: () => nowMs,
        log: (...args) => void logs?.push(formatHookLog(args)),
        signal: opts.signal ?? new AbortController().signal,
    };
    const members = ctx;
    if (grants.storage)
        insertBefore(members, 'signal', 'storage', opts.storage ?? memoryStorage());
    if (grants.fetch)
        insertBefore(members, 'signal', 'fetch', makeFetch(opts, ctx.signal));
    return ctx;
}
/**
 * Put a member in its sandbox position. `signal` is defined last in both
 * backends' programs, so an endowment appended after it would give a context
 * whose key order no install produces — and the key order is the thing a
 * surface test reads.
 */
function insertBefore(obj, before, key, value) {
    const tail = obj[before];
    delete obj[before];
    obj[key] = value;
    obj[before] = tail;
}
function makeFetch(opts, signal) {
    const allow = opts.network ?? [];
    return async (url, init) => {
        // The refusal a plugin without the permission hears. Declared with no
        // hosts — or with every host an admin denied — is the same grant as
        // none, and it must hear "permission not granted" rather than "host not
        // permitted", which would confirm it holds the permission and merely
        // aimed badly.
        if (!allow.length)
            throw new Error('network: permission not granted');
        // No request may START after ctx.signal fires — the host's rule, and the
        // signal read here is the one the handler holds, not the one the caller
        // may or may not have passed in.
        if (signal.aborted)
            throw new Error('fetch: the call was cancelled');
        let u;
        try {
            u = new URL(url);
        }
        catch {
            throw new Error('fetch: a url is required');
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:')
            throw new Error('fetch: only http(s) is allowed');
        const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
        if (matchAllow(allow, host, port) === null)
            throw new Error(`fetch: host not permitted: ${u.host}`);
        if (!opts.fetch)
            throw new Error(`fetch: '${u.host}' is permitted, but this harness was given no answer for it — ` +
                `pass fetch: (url, init) => ({ status, ok, headers, body }) to script the response ` +
                `(nothing here reaches the network)`);
        return await opts.fetch(url, init);
    };
}
/**
 * Project a plugin's handlers into executor bindings that run them against the
 * **sandbox's** context — the harness's counterpart of the app's
 * `pluginNodeBindings` (`pipelines/runtime/pluginBindings.ts`), which does the
 * same projection over a real sandbox.
 *
 * The executor's own context reaches the handler in exactly one respect: its
 * `signal`, because at install the host fires the sandbox's abort from the same
 * place. Everything else it built — `read`, `call`, `commit`, `progress`,
 * `status`, `countTokens` — is dropped, because no sandbox has ever endowed it.
 * A plugin Query reaching for `ctx.read` therefore fails here exactly as it
 * fails at install, which is the whole reason this exists (G13).
 * @experimental
 */
export function pluginNodeBindings(opts) {
    const storage = opts.storage ?? memoryStorage();
    const seed = opts.seed ?? 'seed:harness';
    const bindings = {};
    for (const [pin, handler] of Object.entries(opts.handlers)) {
        const kind = opts.kinds?.[pin] ?? CTX_KIND_OF_NODE[getDefinition(pin)?.kind ?? ''];
        const hook = async (input, execCtx = {}) => {
            if (!kind)
                return err(`${pin}: this harness cannot tell which hook ctx kind '${pin}' dispatches under, so it ` +
                    `cannot decide whether the handler gets ctx.storage or ctx.fetch (plans/29 R-3). ` +
                    `Register the definition before building the bindings, or name it in \`kinds\`.`);
            return await handler(input, pluginHandlerContext({
                pluginId: opts.pluginId,
                kind,
                seed: nodeSeedLabel(seed, pin, input),
                storage,
                now: opts.now,
                signal: execCtx?.signal,
                network: opts.network,
                fetch: opts.fetch,
                logs: opts.logs,
            }));
        };
        bindings[pin] = hook;
    }
    return bindings;
}
//# sourceMappingURL=pluginHarness.js.map