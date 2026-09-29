/**
 * The component wire (§3.5, C2/C3b): what crosses between a page and its UI
 * worker, beside each mount's own widget-protocol port — and the worker
 * side of that port, the {@link ComponentContext} a component is handed.
 *
 * Shared by the app's page and worker, and by the component harness
 * (`@serene-pub/cli/testing`), so the three cannot drift.
 *
 * Remote DOM's mutation records carry FUNCTIONS (event listeners), which
 * `postMessage` cannot clone. They cross as handles instead — `{ [FN]: id }`
 * — and the host calls a handle back with a small, host-chosen event
 * summary (`RemoteEventDetail`), never the live DOM event.
 *
 * What a component sends on its port (an `invoke`, a request, `ready`)
 * leaves the worker on this channel too, as `wire`: one channel, so it
 * cannot overtake the DOM changes of the turn that sent it.
 *
 * @internal
 */
import type { ComponentContext } from './componentClient.js';
import type { RequestDeclineCode } from './surfaces.js';
/** The handle key a function is replaced by on the wire. @experimental */
export declare const FN = "__spFn";
/** @experimental */
export type FnHandle = {
    [FN]: number;
};
/** @experimental */
export declare const isFnHandle: (v: unknown) => v is FnHandle;
/** What a remote listener receives: the declared `detail`, or a control's value. @experimental */
export interface RemoteEventDetail {
    type: string;
    /** The sp element's declared detail (`{ value }`, `{ open }`, …), cloned. */
    detail?: unknown;
    /** A plain control's value, for `input` / `change`. */
    value?: string;
    /** A checkbox's state, for `change`. */
    checked?: boolean;
}
/** Host → worker. @experimental */
export type HostToWorker = {
    k: 'mount';
    mountId: string;
    /** The component's module, same-origin (`/plugin-ui/<owner>/<entry>`). */
    entry: string;
    /**
     * Rides the transfer list: this mount's widget-protocol port. What
     * the component sends back rides the worker channel instead
     * (`wire`), in order with its DOM changes.
     */
    port: ComponentPort;
} | {
    k: 'unmount';
    mountId: string;
} | {
    k: 'fn';
    mountId: string;
    id: number;
    detail: RemoteEventDetail;
};
/** Worker → host. @experimental */
export type WorkerToHost = {
    k: 'mutate';
    mountId: string;
    records: unknown[];
} | {
    k: 'failed';
    mountId: string;
    message: string;
}
/** A mounted component threw while handling an event: said, and the mount lives on. */
 | {
    k: 'error';
    mountId: string;
    message: string;
}
/**
 * A message the component sent on its widget-protocol port, delivered on
 * the worker channel after every mutation of the turn that sent it — so
 * the page sees the DOM change a handler made before the message the
 * same handler sent next (a menu closes, THEN the host's dialog opens; the
 * other way round, the closing menu hands focus back to its trigger and
 * the dialog dismisses itself). The page handles `msg` as one that arrived
 * on the mount's port; the port itself carries page → worker only.
 */
 | {
    k: 'wire';
    mountId: string;
    msg: unknown;
};
/**
 * 🚧 The error a component's `request` rejects with when the host declines:
 * the host's sentence as `message`, and its {@link RequestDeclineCode} as
 * `code` when it gave one (`unmounted` for every request still pending when
 * the component is unmounted). Test `code`, never the sentence.
 * @experimental
 */
export declare class RequestDeclined extends Error {
    readonly code?: RequestDeclineCode;
    constructor(message: string, code?: RequestDeclineCode);
}
/**
 * Replace every function in a value with a handle, registering it. Walks
 * arrays and plain objects; everything else passes as is.
 * @experimental
 */
export declare function encodeFns(value: unknown, register: (fn: (...a: unknown[]) => unknown) => number): unknown;
/** The one port a mount's context speaks over — a DOM or Node `MessagePort`. @experimental */
export interface ComponentPort {
    /**
     * Only ever ASSIGNED here (never called), and a DOM port's handler takes a
     * full `MessageEvent` — so the parameter is `never`, which either port's
     * handler type accepts; the handler this module assigns reads `data` only.
     */
    onmessage: ((e: never) => void) | null;
    postMessage(message: unknown): void;
    close(): void;
}
/**
 * The worker side of a mount's widget-protocol port: the same sections a
 * native widget reads off its context and a frame is posted, and the same
 * verbs back. Runs where the component runs — no page, no network, nothing
 * but this port.
 * @experimental
 */
export declare function createComponentContext(port: ComponentPort): ComponentContext & {
    ready(): void;
    close(): void;
};
//# sourceMappingURL=componentWire.d.ts.map