/**
 * The component harness (§3.5, C3b): mount a component the way a session
 * page does — built by the same bundler, run in a worker by the same
 * runtime, mirrored through the host-element vocabulary — with a canned
 * context, and assert on the DOM the page would show.
 *
 * ```ts
 * import { mountComponent } from '@serene-pub/cli/testing'
 *
 * const view = await mountComponent({
 *   entry: 'components/who-next.ts',
 *   context: { messages: [{ id: 1, content: 'Hi' }] },
 * })
 * expect(view.query('p')?.textContent).toBe('1 messages')
 * await view.click('button')
 * expect(view.invoked).toEqual([{ key: 'advance' }])
 * await view.unmount()
 * ```
 *
 * A component that asks the page for something (`ctx.request`) is answered
 * by the test, as the page would answer it — and every ask is logged. A
 * plugin's box asks only what the SDK's askers table lets it: here the
 * `lore` grant, without which `session-entries` is declined unasked:
 *
 * ```ts
 * const view = await mountComponent({
 *   entry: 'components/lore.ts',
 *   grants: ['lore'],
 *   requests: (kind, params) =>
 *     kind === 'session-entries' ? { lorebookId: null, ownerOnly: false, rows: [], total: 0, offset: 0 } : undefined,
 * })
 * expect(view.requested).toEqual([{ kind: 'session-entries', params: { limit: 25 } }])
 * ```
 *
 * What the page adds that this does not: `sp-*` elements stay as
 * themselves (their attributes and children, not the app's rendering of
 * them), and the page's confirmations are not asked. What it keeps — the
 * base sections the widget `reads` and nothing else (R75), the page's invoke
 * gate (`invokeGate`: a plugin's box changes a message only with a person's
 * press in it, else `refusedInvokes`), ids prefixed per box (`idPrefix`) but
 * in core's conversation — and the page's own guard
 * (`guardedConnection`, which the page runs too): an element or attribute
 * outside the vocabulary never lands (see `refused`), a value the
 * vocabulary's rules refuse is dropped, what the component later writes into
 * a subtree that never landed is dropped with it, every record is judged
 * against what the receiver attached, and a box whose records the receiver
 * refused takes no more (said in `errors`, fatal); the page's rules for WHOSE
 * box it is hold — a plugin's unless `owner: 'core'`; events cross back as
 * the page's summary — a click on a button's label re-delivered to the
 * button, as the page re-delivers it — and what the component sends arrives
 * after the DOM changes of the turn that sent it, as on the page.
 *
 * Needs a DOM for the mirror: the test runner's (`environment: 'happy-dom'`
 * or `'jsdom'`), else `happy-dom` if installed.
 */
import { Worker, MessageChannel } from 'node:worker_threads';
import { mkdir, rm, access, rename, readFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMRemoteReceiver } from '@remote-dom/core/receivers';
import { FN, REDELIVERED_EVENTS, isPersonGatedAction, personGateVerdict, personPressAfter, SP_HOST_ELEMENTS, guardedConnection, hostKeyEvent, keyedInputTarget, receiverElementPolicy, receiverNodeOf, redeliveredCopy, redeliveryTarget, WIDGET_BASE_SECTIONS, WIDGET_SCOPED_SECTIONS, componentBuiltAgainstFinding, componentModuleFindings, parseActionIdentity, projectMessageRow, widgetEventHeard, widgetReads, widgetRequestRefusal, } from '@serene-pub/sdk';
import { bundleComponent, packageRoot } from './componentBundle.js';
// ─── the page's summary of an event ─────────────────────────────────────────
/** The page's summary of an event — never the event itself. */
function summarize(event, type, Custom) {
    const out = { type };
    if (!event)
        return out;
    if (event instanceof Custom) {
        try {
            out.detail = structuredClone(event.detail);
        }
        catch {
            /* not cloneable: no detail, as on the page */
        }
        return out;
    }
    const t = event.target;
    if (t && (type === 'input' || type === 'change')) {
        if (typeof t.value === 'string')
            out.value = t.value;
        if (t.type === 'checkbox' || t.type === 'radio')
            out.checked = !!t.checked;
    }
    return out;
}
// ─── the worker ─────────────────────────────────────────────────────────────
/** The worker bootstrap, bundled once per process per cache dir (the runtime ships as source). */
const workers = new Map();
function workerModule(cache) {
    let held = workers.get(cache);
    if (!held) {
        held = (async () => {
            const out = join(cache, 'harness-worker.mjs');
            // A path, never a `URL`: a DOM test environment replaces `URL` with its own.
            const here = dirname(fileURLToPath(import.meta.url));
            const js = join(here, 'testingWorker.js');
            const source = (await exists(js)) ? js : join(here, 'testingWorker.ts');
            const esbuild = await import('esbuild');
            // Written aside, then renamed: parallel test processes share the file.
            const aside = `${out}.${process.pid}-${randomUUID()}.tmp`;
            await esbuild.build({
                entryPoints: [source],
                outfile: aside,
                bundle: true,
                format: 'esm',
                platform: 'node',
                target: 'node20',
                logLevel: 'silent',
                // A bundled CJS dependency still reaches for `require`.
                banner: {
                    js: "import { createRequire as __spRequire } from 'node:module'; const require = __spRequire(import.meta.url);",
                },
            });
            await rename(aside, out);
            return out;
        })();
        held.catch(() => workers.delete(cache));
        workers.set(cache, held);
    }
    return held;
}
const exists = (p) => access(p).then(() => true, () => false);
/** Where a mount's built module and the worker bundle go. */
async function cacheDir(root, given) {
    if (given)
        return given;
    // Beside the package when it has a node_modules (a crashed run leaves
    // nothing where no one looks); else one fixed directory under the OS temp
    // dir — never a fresh one per run.
    const nm = join(root, 'node_modules');
    return (await exists(nm)) ? join(nm, '.cache', 'serene-pub-harness') : join(tmpdir(), 'serene-pub-harness');
}
// A happy-dom window lent to every mount that runs without a DOM, and taken
// back when the LAST of them leaves: concurrent mounts share it.
let lent;
async function ensureDocument() {
    const g = globalThis;
    if (lent) {
        lent.users++;
        return { document: lent.document, restore: release };
    }
    if (g.document)
        return { document: g.document, restore: () => { } };
    let HappyWindow;
    try {
        ;
        ({ Window: HappyWindow } = (await import('happy-dom')));
    }
    catch {
        throw new Error('mountComponent needs a DOM to mirror into: run it in a DOM test environment ' +
            "(vitest `environment: 'happy-dom'`), or install happy-dom");
    }
    if (lent) {
        ;
        lent.users++;
        return { document: lent.document, restore: release };
    }
    const win = new HappyWindow();
    // Remote DOM's receiver reads the DOM's globals, not only `document`:
    // lend the ones this runtime lacks.
    const names = [];
    for (const name of ['document', ...DOM_GLOBALS])
        if (g[name] === undefined && win[name] !== undefined) {
            g[name] = win[name];
            names.push(name);
        }
    lent = { document: win.document, names, close: () => win.close?.(), users: 1 };
    return { document: win.document, restore: release };
}
function release() {
    if (!lent || --lent.users > 0)
        return;
    const g = globalThis;
    for (const name of lent.names)
        delete g[name];
    lent.close?.();
    lent = undefined;
}
const DOM_GLOBALS = [
    'Node',
    'Element',
    'HTMLElement',
    'Text',
    'Comment',
    'CharacterData',
    'DocumentFragment',
    'MutationObserver',
    'Event',
    'CustomEvent',
];
/** The order the page's widget wire posts in (`push()`): saved state first, theme and locale last. */
const PUSH_ORDER = [
    'state',
    'session',
    'messages',
    'channels',
    'props',
    'settings',
    'actions',
    'annex',
    'layout',
    'theme',
    'locale',
    'viewer',
    'turnOrder',
    'scoped',
];
/**
 * The events the page's widget wire raises about a base section, and the
 * section each is about: a widget that does not read it is not told (R75).
 */
const READ_GATED_EVENTS = {
    'message:created': 'messages',
    'layout:changed': 'layout',
};
/**
 * The person-gated core action a key names, as the page resolves it: against the posted
 * `actions` venues (an identity, or the bare key's one carrier), else by the
 * key itself (`retry`, `core#retry`) — a harness is often posted no venues,
 * and on the page an unlisted key is never carried out at all.
 */
function gatedCoreAction(key, actions) {
    const listed = Object.values((actions ?? {})).flatMap((v) => [...(Array.isArray(v?.primary) ? v.primary : []), ...(Array.isArray(v?.overflow) ? v.overflow : [])]);
    const parsed = parseActionIdentity(key);
    const found = parsed
        ? (listed.find((a) => a.specSlug === parsed.specSlug && a.key === parsed.key) ?? parsed)
        : (listed.find((a) => a.key === key && a.specSlug === 'core') ?? listed.find((a) => a.key === key) ?? { specSlug: 'core', key });
    if (typeof found.specSlug !== 'string' || typeof found.key !== 'string')
        return undefined;
    const action = { specSlug: found.specSlug, key: found.key };
    return isPersonGatedAction(action) ? action : undefined;
}
// ─── mount ──────────────────────────────────────────────────────────────────
/** Boxes mounted so far in this process — the page numbers its boxes into their id prefix. */
let boxes = 0;
/** @public */
export async function mountComponent(opts) {
    const entry = resolve(opts.root ?? process.cwd(), opts.entry);
    // What a host refuses before mounting (F1): a contract it no longer speaks.
    const incompatible = componentBuiltAgainstFinding(opts.builtAgainst);
    if (incompatible)
        throw new Error(`the component is not mounted: ${incompatible}`);
    if (opts.built && !(await exists(entry)))
        throw new Error(`no component at ${entry}`);
    // The package the component belongs to, as `serene-pub build` finds it —
    // its Svelte, its own files — unless the caller names one.
    const root = opts.root ? resolve(opts.root) : await packageRoot(entry);
    if (/\.m?js$/.test(entry) && !(await exists(entry)))
        throw new Error(`no component at ${entry}`);
    const cache = await cacheDir(root, opts.cacheDir);
    await mkdir(cache, { recursive: true });
    const built = join(cache, `component-${randomUUID()}.mjs`);
    // The box's grants, as the page holds them: core's with none given holds
    // every scope (core holds every scope it declares, and the harness cannot
    // see the declaration); a plugin's with none holds none.
    let currentGrants = opts.owner === 'core' && opts.grants === undefined
        ? Object.keys(WIDGET_SCOPED_SECTIONS)
        : [...(opts.grants ?? [])];
    const invoked = [];
    const refusedInvokes = [];
    const owner = opts.owner ?? 'plugin';
    /** The base sections the box is posted (R75), clamped as the page clamps them. */
    const reads = new Set(widgetReads({ reads: opts.reads }));
    const gated = owner !== 'core' && opts.invokeGate !== false;
    // When a person last acted in the box (a press the component heard), or
    // null — also once focus left it — as the page's `lastInteractionAt`.
    let lastPress = null;
    /** The `actions` section as last posted: what an invoke is resolved against. */
    let postedActions = opts.context?.actions;
    const saved = [];
    const errors = [];
    const refused = [];
    const requested = [];
    // Requests asked and not yet answered, by id → kind: declined at unmount.
    const unanswered = new Map();
    // Answers posted so far: an answer prompts the component, so `settle` waits on it too.
    let replies = 0;
    // Everything below is undone by `cleanup`, whichever step fails.
    let restore;
    let box;
    let worker;
    let controls;
    let port;
    let clearCapture;
    const cleanup = async () => {
        controls?.disconnect();
        clearCapture?.();
        port?.close();
        await worker?.terminate();
        box?.remove();
        restore?.();
        await rm(built, { force: true });
    };
    try {
        if (opts.built)
            await copyFile(entry, built);
        else
            await bundleComponent({ entry, outfile: built, root, alias: opts.alias });
        // Judged as a host judges it: what no page would load is not mounted here either.
        const { errors: findings } = componentModuleFindings(await readFile(built, 'utf8'));
        if (findings.length)
            throw new Error(`the built component would be refused: ${findings.join('; ')}`);
        const dom = await ensureDocument();
        restore = dom.restore;
        const document = dom.document;
        const win = document.defaultView;
        const theBox = document.createElement('div');
        box = theBox;
        theBox.setAttribute('data-sp-harness', '');
        document.body.appendChild(theBox);
        // The event each listener answers is the one of ITS type firing now —
        // a click on a checkbox fires `change` inside the `click` — caught on
        // the way down, as the page does (`currentEvent`).
        const current = new Map();
        const redelivered = new WeakSet();
        // The events the harness raises AS a person (`click`, `pressKey`,
        // `input`, `check`) — what the page tells by `isTrusted`.
        const personal = new WeakSet();
        const capture = (e) => {
            // A re-delivered copy is not the person's event: theirs stays current.
            if (redelivered.has(e))
                return;
            current.set(e.type, e);
            setTimeout(() => current.get(e.type) === e && current.delete(e.type), 0);
        };
        // A click on a node that does not take it (a button's label, an icon)
        // re-delivered to the element that does, as the page re-delivers it —
        // the SDK's rule and copy, the page's. A copy is not re-delivered again.
        const redeliver = (e) => {
            if (redelivered.has(e) || !e.target)
                return;
            const to = redeliveryTarget(e.target, e.type, theBox);
            if (!to)
                return;
            capture(e);
            const copy = redeliveredCopy(e);
            redelivered.add(copy);
            to.dispatchEvent(copy);
            if (copy.defaultPrevented)
                e.preventDefault();
        };
        // A press a plain `input`'s `keys` names, kept from the field and
        // raised on it as `key` — the SDK's reading and event, the page's. A
        // person's press opens the box's invoke window, as the page vouches a
        // trusted one (the raised `key` itself is no person's event).
        const raiseKey = (e) => {
            const to = keyedInputTarget(e, theBox);
            if (!to)
                return;
            e.preventDefault();
            lastPress = personPressAfter('keydown', personal.has(e), lastPress, Date.now());
            to.dispatchEvent(hostKeyEvent(e));
        };
        const types = new Set(Object.values(SP_HOST_ELEMENTS).flatMap((s) => s.events));
        for (const t of types)
            theBox.addEventListener(t, capture, true);
        for (const t of REDELIVERED_EVENTS)
            document.addEventListener(t, redeliver, true);
        theBox.addEventListener('keydown', raiseKey, true);
        clearCapture = () => {
            for (const t of types)
                theBox.removeEventListener(t, capture, true);
            for (const t of REDELIVERED_EVENTS)
                document.removeEventListener(t, redeliver, true);
            theBox.removeEventListener('keydown', raiseKey, true);
        };
        const theWorker = new Worker(await workerModule(cache));
        worker = theWorker;
        const mountId = randomUUID();
        // The page's rule for whose ids are whose: every box's are prefixed per
        // mount — a plugin's, and each of core's widgets' — but core's own
        // conversation, which the page navigates by its native ids.
        const idPrefix = owner === 'core' && opts.coreConversation ? '' : `sp-r${++boxes}-${mountId.slice(0, 8)}-`;
        const fnFor = (handle, event) => () => {
            // As the page's `interactionAfter`: a person's press opens the
            // invoke window, a synthetic event leaves it, a `blur` closes it.
            const e = current.get(event);
            lastPress = personPressAfter(event, !!e && personal.has(e), lastPress, Date.now());
            theWorker.postMessage({
                k: 'fn',
                mountId,
                id: handle[FN],
                detail: summarize(current.get(event), event, win.CustomEvent),
            });
        };
        // The page's guard, by the page's own call: judged against what the
        // receiver attached, ids the component's own (the page prefixes them
        // per box), each refusal listed as its sentence.
        const receiver = new DOMRemoteReceiver({ root: theBox, elements: receiverElementPolicy() });
        const connection = guardedConnection(receiver.connection, receiverNodeOf(receiver), {
            owner,
            idPrefix,
            fnFor,
            refuse: (r) => refused.push(r.finding),
        });
        // A control's value written by the component is its LIVE value, as the page makes it.
        const sync = (el, name) => {
            if (el.localName !== 'input' && el.localName !== 'textarea')
                return;
            const c = el;
            if (name !== 'checked') {
                const v = el.getAttribute('value');
                if (v !== null && c.value !== v)
                    c.value = v;
            }
            if (name !== 'value' && el.localName === 'input')
                c.checked = el.hasAttribute('checked');
        };
        controls = new win.MutationObserver((records) => {
            for (const r of records)
                if (r.type === 'attributes')
                    sync(r.target, r.attributeName);
                else
                    for (const n of r.addedNodes)
                        if (n.nodeType === 1) {
                            sync(n, null);
                            n.querySelectorAll('input, textarea').forEach((c) => sync(c, null));
                        }
        });
        controls.observe(theBox, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'checked'] });
        let mutations = 0;
        let pongs = 0;
        const pongWaiters = new Map();
        let dead;
        let onReady;
        let onFail;
        const die = (e) => {
            dead ??= e;
            onFail?.(e);
            for (const w of pongWaiters.values())
                w.reject(e);
            pongWaiters.clear();
        };
        // The page's answers to what the component asks, on the mount's port.
        // Each answers once, and never after the harness let go of the port.
        const reply = (requestId, m) => {
            if (!unanswered.delete(requestId))
                return;
            replies++;
            port?.postMessage({ requestId, ...m });
        };
        const decline = (requestId, kind, why) => {
            // `messages` declines silently, as the page's does (the frame
            // protocol's rule): it waits, and is declined at unmount.
            if (kind !== 'messages')
                reply(requestId, { t: 'response', ok: false, error: why });
        };
        const answer = (m) => {
            const requestId = String(m.requestId);
            const kind = String(m.what);
            // `messages` carries its params at the top level; every other kind in `params`.
            const params = kind === 'messages'
                ? Object.fromEntries(['channel', 'cursor', 'limit'].filter((k) => m[k] !== undefined).map((k) => [k, m[k]]))
                : m.params && typeof m.params === 'object'
                    ? m.params
                    : {};
            requested.push({ kind, params });
            unanswered.set(requestId, kind);
            const refusal = widgetRequestRefusal(kind, {
                owner,
                grants: currentGrants,
            });
            if (refusal)
                return decline(requestId, kind, refusal);
            if (!opts.requests)
                return;
            let out;
            try {
                out = opts.requests(kind, params);
            }
            catch (e) {
                return decline(requestId, kind, e?.message ?? String(e));
            }
            Promise.resolve(out).then((result) => {
                if (kind !== 'messages')
                    return reply(requestId, { t: 'response', ok: true, result });
                const page = (result ?? {});
                // The page strips host bookkeeping off every row it posts (`MESSAGE_HOST_FIELDS`).
                reply(requestId, { t: 'page', rows: (page.rows ?? []).map(projectMessageRow), nextCursor: page.nextCursor });
            }, (e) => decline(requestId, kind, e?.message ?? String(e)));
        };
        // What the component sent on its port: on the worker channel (`wire`),
        // behind the DOM changes of its turn — or on the port, from a worker
        // that predates that.
        const onWire = (m) => {
            if (!m || typeof m !== 'object')
                return;
            if (m.t === 'ready')
                onReady?.();
            else if (m.t === 'invoke') {
                const { t: _t, ...rest } = m;
                const record = rest;
                // The page's gate: a verb that changes a message, from a box that
                // is not core's, needs a person acting in the box right now.
                const action = gated ? gatedCoreAction(String(record.key), postedActions) : undefined;
                const verdict = action ? personGateVerdict(action, lastPress, Date.now()) : { allowed: true };
                if (!verdict.allowed)
                    refusedInvokes.push({ ...record, reason: verdict.reason });
                else
                    invoked.push(record);
            }
            else if (m.t === 'save-state')
                saved.push(m.state);
            else if (m.t === 'error')
                errors.push({ message: String(m.message), fatal: !!m.fatal });
            else if (m.t === 'request' && typeof m.requestId === 'string')
                answer(m);
        };
        theWorker.on('message', (m) => {
            if (m.k === 'pong') {
                pongWaiters.get(m.n)?.resolve();
                pongWaiters.delete(m.n);
            }
            else if (m.k === 'mutate') {
                mutations++;
                try {
                    connection.mutate(m.records);
                }
                catch (e) {
                    // As the page: a box that no longer matches the component stops, and says so.
                    errors.push({ message: `the page could not show what the component sent: ${e.message}`, fatal: true });
                }
            }
            else if (m.k === 'wire')
                onWire(m.msg);
            else if (m.k === 'error')
                errors.push({ message: m.message, fatal: false });
            else if (m.k === 'failed')
                die(new Error(`the component did not mount: ${m.message}`));
        });
        theWorker.on('error', (e) => die(e));
        theWorker.on('exit', (code) => die(new Error(`the component's worker exited (${code})`)));
        const channel = new MessageChannel();
        port = channel.port1;
        port.on('message', onWire);
        const ready = new Promise((res, rej) => {
            onReady = res;
            onFail = rej;
        });
        theWorker.postMessage({ k: 'mount', mountId, entry: pathToFileURL(built).href, port: channel.port2 }, [channel.port2]);
        const timeout = opts.timeoutMs ?? 10_000;
        let timer;
        try {
            await Promise.race([
                ready,
                new Promise((_, rej) => {
                    timer = setTimeout(() => rej(new Error(`the component did not mount within ${timeout} ms`)), timeout);
                }),
            ]);
        }
        finally {
            clearTimeout(timer);
        }
        onFail = undefined;
        const thePort = port;
        const post = (m) => thePort.postMessage(m);
        const macrotask = () => new Promise((r) => setTimeout(r, 0));
        const settle = async () => {
            // Until a round trip brings nothing new: a change can prompt another,
            // and so can an answer to a request (`requests`). What the component
            // schedules for LATER (a timer, an answer your `requests` gives
            // later) is not waited for.
            for (let i = 0; i < 50; i++) {
                if (dead)
                    throw dead;
                await macrotask();
                const before = mutations;
                const answered = replies;
                const n = ++pongs;
                await new Promise((resolve, reject) => {
                    pongWaiters.set(n, { resolve, reject });
                    theWorker.postMessage({ k: 'ping', n });
                });
                await macrotask();
                if (mutations === before && replies === answered)
                    return;
            }
        };
        // The scoped sections this box may hold, by posted name: those its
        // grants cover — the page never posts a section past its grant, core's
        // widget included (it is posted its declared scopes' sections), so
        // neither does the harness. Core's box with no `grants` holds every
        // one: core holds every scope it declares, and the harness cannot see
        // the declaration.
        // The scopes the box holds that deliver a section, as the page tells
        // the component (`grants`) — `channel:<slug>` is not one.
        const heldScopes = () => currentGrants.filter((scope) => Object.hasOwn(WIDGET_SCOPED_SECTIONS, scope));
        const heldSections = new Set(heldScopes().map((scope) => WIDGET_SCOPED_SECTIONS[scope]));
        /** The scoped sections posted and not withdrawn — what a narrower grant takes back. */
        const postedScoped = new Set();
        const pushSection = (section, value) => {
            // A base section the widget does not read is never posted (R75) —
            // the lanes (`channels`) are the `messages` section, as the page posts them.
            const base = section === 'channels' ? 'messages' : section;
            if (WIDGET_BASE_SECTIONS.includes(base) && !reads.has(base))
                return;
            if (section === 'actions')
                postedActions = value;
            switch (section) {
                // Rows as the page posts them: host bookkeeping stripped (`MESSAGE_HOST_FIELDS`),
                // so a test cannot pass on a field a real session never sends.
                case 'messages':
                    return post({ t: 'messages', messages: Array.isArray(value) ? value.map(projectMessageRow) : value });
                case 'channels':
                    for (const [channel, messages] of Object.entries((value ?? {})))
                        post({ t: 'channel', channel, messages: (messages ?? []).map(projectMessageRow) });
                    return;
                case 'scoped':
                    for (const [name, v] of Object.entries((value ?? {})))
                        if (heldSections.has(name)) {
                            post({ t: 'scoped', section: name, value: v });
                            if (v === null)
                                postedScoped.delete(name);
                            else
                                postedScoped.add(name);
                        }
                    return;
                case 'turnOrder':
                    return post({ t: 'turn-order', turnOrder: value });
                case 'theme': {
                    const t = value;
                    return post({ t: 'theme', theme: t.theme, mode: t.mode });
                }
                default:
                    return post({ t: section, [section]: value });
            }
        };
        // What the page posts once the component says it is ready, in the page's order.
        const initial = { theme: { theme: '', mode: 'light' }, locale: 'en', ...opts.context };
        for (const section of PUSH_ORDER) {
            if (initial[section] !== undefined)
                pushSection(section, initial[section]);
            // The grants after saved state, before any section — as the page posts them.
            if (section === 'state')
                post({ t: 'grants', grants: heldScopes() });
        }
        await settle();
        const target = (selector) => {
            if (typeof selector !== 'string')
                return selector;
            const el = theBox.querySelector(selector);
            if (!el)
                throw new Error(`nothing matches '${selector}' in the mirrored component`);
            return el;
        };
        const person = (event) => {
            personal.add(event);
            return event;
        };
        const raise = async (el, event) => {
            el.dispatchEvent(event);
            await settle();
        };
        return {
            root: theBox,
            html: () => theBox.innerHTML,
            query: (s) => theBox.querySelector(s),
            queryAll: (s) => [...theBox.querySelectorAll(s)],
            async push(section, value) {
                pushSection(section, value);
                await settle();
            },
            async event(event) {
                // As the page tells a box: a kind about scoped data only past its grant.
                const kind = event?.kind;
                // And one about a base section only to a widget that reads it (R75).
                const about = typeof kind === 'string' && Object.hasOwn(READ_GATED_EVENTS, kind) ? READ_GATED_EVENTS[kind] : undefined;
                if ((about === undefined || reads.has(about)) &&
                    (typeof kind !== 'string' || widgetEventHeard(kind, { owner, grants: currentGrants })))
                    post({ t: 'event', event });
                await settle();
            },
            async setGrants(grants) {
                currentGrants = [...grants];
                heldSections.clear();
                for (const scope of heldScopes())
                    heldSections.add(WIDGET_SCOPED_SECTIONS[scope]);
                post({ t: 'grants', grants: heldScopes() });
                // A worker keeps nothing it may no longer see, as the page withdraws it.
                for (const name of [...postedScoped])
                    if (!heldSections.has(name)) {
                        post({ t: 'scoped', section: name, value: null });
                        postedScoped.delete(name);
                    }
                await settle();
            },
            click: (s) => raise(target(s), person(new win.MouseEvent('click', { bubbles: true, cancelable: true }))),
            async input(s, value) {
                const el = target(s);
                el.value = value;
                await raise(el, person(new win.Event('input', { bubbles: true })));
            },
            async pressKey(s, key, held = {}) {
                const press = new win.KeyboardEvent('keydown', {
                    key,
                    shiftKey: !!held.shift,
                    ctrlKey: !!held.ctrl,
                    metaKey: !!held.meta,
                    bubbles: true,
                    cancelable: true,
                });
                await raise(target(s), person(press));
                return press.defaultPrevented;
            },
            async check(s, checked = true) {
                const el = target(s);
                el.checked = checked;
                await raise(el, person(new win.Event('change', { bubbles: true })));
            },
            dispatch(s, type, detail) {
                const el = target(s);
                // An sp element's own event is the element's, not a person's — but
                // a document's press arriving as an `sp-frame`'s `invoke` is a
                // person's inside it, which the page vouches for at the box's gate.
                if (type === 'invoke' && el.localName === 'sp-frame')
                    lastPress = Date.now();
                return raise(el, new win.CustomEvent(type, { detail, bubbles: true }));
            },
            settle,
            invoked,
            refusedInvokes,
            idPrefix,
            saved,
            errors,
            refused,
            requested,
            unmount: async () => {
                if (!dead) {
                    // What nobody answered is declined first, while the
                    // component is still mounted to hear it.
                    if (unanswered.size) {
                        for (const requestId of [...unanswered.keys()])
                            reply(requestId, {
                                t: 'response',
                                ok: false,
                                error: 'the page was unmounted before it answered',
                                code: 'unmounted',
                            });
                        await settle().catch(() => { });
                    }
                    theWorker.postMessage({ k: 'unmount', mountId });
                    await settle().catch(() => { });
                }
                unanswered.clear();
                await cleanup();
            },
        };
    }
    catch (e) {
        await cleanup();
        throw e;
    }
}
//# sourceMappingURL=testing.js.map