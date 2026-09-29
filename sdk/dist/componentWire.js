import { WIDGET_SCOPED_SECTIONS, isWidgetScopedSectionName } from './widgets.js';
/** The handle key a function is replaced by on the wire. @experimental */
export const FN = '__spFn';
/** @experimental */
export const isFnHandle = (v) => !!v && typeof v === 'object' && typeof v[FN] === 'number';
/**
 * 🚧 The error a component's `request` rejects with when the host declines:
 * the host's sentence as `message`, and its {@link RequestDeclineCode} as
 * `code` when it gave one (`unmounted` for every request still pending when
 * the component is unmounted). Test `code`, never the sentence.
 * @experimental
 */
export class RequestDeclined extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = 'RequestDeclined';
        if (code !== undefined)
            this.code = code;
    }
}
/**
 * Replace every function in a value with a handle, registering it. Walks
 * arrays and plain objects; everything else passes as is.
 * @experimental
 */
export function encodeFns(value, register) {
    if (typeof value === 'function')
        return { [FN]: register(value) };
    if (Array.isArray(value))
        return value.map((v) => encodeFns(v, register));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = encodeFns(v, register);
        return out;
    }
    return value;
}
/**
 * The worker side of a mount's widget-protocol port: the same sections a
 * native widget reads off its context and a frame is posted, and the same
 * verbs back. Runs where the component runs — no page, no network, nothing
 * but this port.
 * @experimental
 */
export function createComponentContext(port) {
    const data = { channels: {}, suspended: false, scoped: {} };
    // Requests in flight, by id; the host answers each once (`page` / `response`).
    const pending = new Map();
    let nextRequest = 0;
    // Translations the host sent, and the misses not yet asked for — asked in
    // one batch per task, as the app's own `t()` does.
    const strings = new Map();
    const asked = new Set();
    let misses = [];
    const askLater = () => {
        if (misses.length !== 1)
            return;
        setTimeout(() => {
            const sources = misses;
            misses = [];
            if (sources.length)
                port.postMessage({ t: 'translate', sources });
        }, 0);
    };
    const subs = new Set();
    const eventSubs = new Set();
    const notify = (section) => {
        for (const fn of subs) {
            try {
                fn(section);
            }
            catch (e) {
                console.error(e);
            }
        }
    };
    port.onmessage = (e) => {
        const m = e.data;
        if (!m || typeof m !== 'object')
            return;
        switch (m.t) {
            case 'session':
                data.session = m.session;
                return notify('session');
            case 'messages':
                data.messages = m.messages;
                return notify('messages');
            case 'channel':
                data.channels = { ...data.channels, [String(m.channel)]: m.messages };
                return notify('channels');
            case 'settings':
                data.settings = m.settings;
                return notify('settings');
            case 'actions':
                data.actions = m.actions;
                return notify('actions');
            case 'annex':
                data.annex = m.annex;
                return notify('annex');
            case 'props':
                data.props = m.props;
                return notify('props');
            case 'theme':
                data.theme = { theme: String(m.theme ?? ''), mode: m.mode === 'dark' ? 'dark' : 'light' };
                return notify('theme');
            case 'scoped': {
                const name = m.section;
                // A name the table does not carry is not a section this widget can hold.
                if (isWidgetScopedSectionName(name)) {
                    // `null` withdraws it: the grant went away.
                    const { [name]: _gone, ...rest } = data.scoped;
                    data.scoped = (m.value === null ? rest : { ...rest, [name]: m.value });
                }
                return notify('scoped');
            }
            case 'grants': {
                // A list, or nothing new; only a scope the table names is kept.
                if (!Array.isArray(m.grants))
                    return;
                data.grants = m.grants.filter((g) => typeof g === 'string' && Object.hasOwn(WIDGET_SCOPED_SECTIONS, g));
                return notify('grants');
            }
            case 'viewer':
                data.viewer = m.viewer;
                return notify('viewer');
            case 'turn-order':
                data.turnOrder = m.turnOrder;
                return notify('turnOrder');
            case 'page':
            case 'response': {
                const waiting = pending.get(String(m.requestId));
                if (!waiting)
                    return;
                pending.delete(String(m.requestId));
                if (m.t === 'page')
                    return waiting.resolve({ rows: m.rows, nextCursor: m.nextCursor });
                return m.ok
                    ? waiting.resolve(m.result)
                    : waiting.reject(new RequestDeclined(String(m.error ?? 'the host declined'), m.code === 'unmounted' ? 'unmounted' : undefined));
            }
            case 'strings':
                for (const [k, v] of Object.entries((m.strings ?? {})))
                    if (typeof v === 'string')
                        strings.set(k, v);
                return notify('strings');
            case 'locale':
                data.locale = String(m.locale ?? 'en');
                return notify('locale');
            case 'layout':
                data.layout = m.layout;
                return notify('layout');
            case 'state':
                data.state = m.state;
                return notify('state');
            case 'suspend':
            case 'resume':
                data.suspended = m.t === 'suspend';
                return notify('suspended');
            case 'event':
                for (const fn of eventSubs) {
                    try {
                        fn(m.event);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
                return notify('event');
            // `style` is the host's: applied to the box, never to worker code.
        }
    };
    const ctx = {
        get session() {
            return data.session;
        },
        get messages() {
            return data.messages;
        },
        get channels() {
            return data.channels;
        },
        get settings() {
            return data.settings;
        },
        get actions() {
            return data.actions;
        },
        get annex() {
            return data.annex;
        },
        get props() {
            return data.props;
        },
        get theme() {
            return data.theme;
        },
        get locale() {
            return data.locale;
        },
        get layout() {
            return data.layout;
        },
        get state() {
            return data.state;
        },
        get suspended() {
            return data.suspended;
        },
        subscribe(fn) {
            subs.add(fn);
            return () => subs.delete(fn);
        },
        onEvent(fn) {
            eventSubs.add(fn);
            return () => eventSubs.delete(fn);
        },
        invoke(key, args = {}) {
            port.postMessage({ t: 'invoke', key, ...args });
        },
        saveState(state) {
            port.postMessage({ t: 'save-state', state });
        },
        error(message, fatal = false) {
            port.postMessage({ t: 'error', message: String(message), fatal });
        },
        get scoped() {
            return data.scoped;
        },
        action(fn, messageId, payload, action, blockId) {
            port.postMessage({ t: 'action', fn, messageId, payload, action, blockId });
        },
        request(kind, params) {
            const requestId = `r${++nextRequest}`;
            return new Promise((resolve, reject) => {
                pending.set(requestId, { resolve, reject });
                port.postMessage(kind === 'messages'
                    ? { t: 'request', requestId, what: 'messages', ...params }
                    : { t: 'request', requestId, what: kind, params });
            });
        },
        t(source) {
            const hit = strings.get(source);
            if (hit !== undefined)
                return hit;
            if (!asked.has(source)) {
                asked.add(source);
                misses.push(source);
                askLater();
            }
            return source;
        },
        get viewer() {
            return data.viewer;
        },
        get turnOrder() {
            return data.turnOrder;
        },
        get grants() {
            return data.grants;
        },
        granted(scope) {
            return data.grants === undefined ? undefined : data.grants.includes(scope);
        },
        ready() {
            port.postMessage({ t: 'ready' });
        },
        close() {
            for (const w of pending.values())
                w.reject(new RequestDeclined('the component was unmounted', 'unmounted'));
            pending.clear();
            subs.clear();
            eventSubs.clear();
            port.close();
        }
    };
    return ctx;
}
//# sourceMappingURL=componentWire.js.map