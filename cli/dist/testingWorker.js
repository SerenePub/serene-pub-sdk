/**
 * The component harness's worker (C3b): the page's UI worker, in a Node
 * worker thread. Starts the same runtime the app's worker starts
 * (`@serene-pub/component-client/worker-runtime`), so a component under
 * test runs against the same DOM polyfill, event forwarding and control
 * values it meets in a session.
 *
 * Bundled by `mountComponent` at first use — the runtime ships as source.
 */
import { parentPort } from 'node:worker_threads';
import { afterOutbox, lockDownWorker, startComponentWorker } from '@serene-pub/component-client/worker-runtime';
// What the page's worker does not have, this one does not either — the same
// list the app's worker strips: a component that passes here and reaches
// for the network in a session would be a lie.
lockDownWorker();
const port = parentPort;
// A listener's error is re-thrown on a timer by the DOM polyfill. A browser
// worker reports it and runs on; a Node worker would die of it — so it is
// reported here instead, as the page's console would show it. One mount per
// harness worker, so the error needs no mount id.
process.on('uncaughtException', (e) => port.postMessage({ k: 'error', mountId: '', message: e instanceof Error ? e.message : String(e) }));
const handle = startComponentWorker({
    post: (m) => port.postMessage(m),
    importModule: (entry) => import(entry),
});
port.on('message', (m) => {
    // A round trip AFTER everything queued so far has run — the messages a
    // component's turn held back behind its DOM changes included: the page's
    // `settle()` waits on it.
    if (m && m.k === 'ping')
        return void setTimeout(() => afterOutbox(() => port.postMessage({ k: 'pong', n: m.n })), 0);
    handle(m);
});
//# sourceMappingURL=testingWorker.js.map