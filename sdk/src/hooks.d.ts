/**
 * The three hook kinds and their injected surfaces (01 §9, F10, F32).
 *
 * "Hook" is never used bare — the three kinds have different rules, and the rules are
 * enforced by *what is in the object*, not by a document someone reads. A capability
 * that isn't on the surface cannot be called, which is why these are types rather than
 * a checklist.
 */
import type { Result } from './executor.js';
import type { ExtensionStorage } from './storage.js';
/**
 * Log severities.
 *
 * Was `'info' | 'warn'`, which left an extension no way to say a thing had
 * actually failed — so failures were logged as warnings and became invisible in
 * exactly the situation a log exists for. `debug` is the other half of the same
 * problem: without it, authors log at `info` and users get noise.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Scoped reads of core tables.
 *
 * Typed as a query rather than `unknown` so a host can validate it, and
 * paginated because the previous signature had no answer at all for a table
 * with a hundred thousand rows — an extension either got everything or wrote
 * its own windowing on top of a call that could not window.
 */
export interface CoreQuery {
    /** Column filters, ANDed. Values are compared for equality. */
    where?: Record<string, unknown>;
    limit?: number;
    cursor?: string;
    order?: {
        column: string;
        direction?: 'asc' | 'desc';
    };
}
export interface CorePage<T = unknown> {
    rows: T[];
    nextCursor?: string;
}
/**
 * Data in, expected shape out; the executor is the only caller. Private = only the
 * owning extension's specs may pin it. Public = any spec may, which is how peer
 * composition happens — as a node on the spine, never a peer call mid-run (F10).
 *
 * Both are enumerated in the manifest. Listing private ones costs nothing and the
 * manifest is already the audit surface, since permissions are compiled from SDK
 * usage (13 §7c).
 */
export interface PipelineHookRules {
    kind: 'pipeline';
    typeId: string;
    visibility: 'private' | 'public';
}
export interface EventHookSurface {
    readEvent(): unknown;
    /** The extension's own rows and files — query, write, delete, and ask how
     *  much room is left. See storage.ts for why all four are needed. */
    storage: ExtensionStorage;
    log(level: LogLevel, message: string, detail?: unknown): void;
    signal: AbortSignal;
    /** Deliberately absent: callProvider (F32), trigger (F10), readCore — an
     *  event hook is told what happened; reading the rest of the instance is
     *  the lifecycle surface's privilege, and widening this one would make
     *  every event subscription a database grant. */
    /** @deprecated use `storage.get` / `storage.query`. */
    readOwnRows?(key?: string): unknown;
    /** @deprecated use `storage.put`, which reports quota instead of dropping. */
    writeOwnRows?(key: string, value: unknown): void;
}
/**
 * Scoped core reads, plus read/write on the extension's own namespaced rows. Nothing
 * else (13 §7c).
 *
 * Two absences, and they are the same absence for the same reason. A lifecycle hook
 * may not call a Provider and may not trigger a pipeline, so **scheduled model work
 * subscribes to `core:event/schedule-tick@1` instead** — which gets it a receipt, a
 * budget and the review gate, and puts it on the consent screen. A lifecycle hook
 * doing that work would have had none of the four.
 */
export interface LifecycleHookSurface {
    readCore<T = unknown>(table: string, q?: CoreQuery): Promise<CorePage<T>>;
    storage: ExtensionStorage;
    log(level: LogLevel, message: string, detail?: unknown): void;
    signal: AbortSignal;
    /** Deliberately absent: callProvider (F32), trigger (F10), writeCore. */
    /** @deprecated use `storage.get` / `storage.query`. */
    readOwnRows?(key?: string): unknown;
    /** @deprecated use `storage.put`, which reports quota instead of dropping. */
    writeOwnRows?(key: string, value: unknown): void;
}
export type LifecycleMoment = 'load' | 'startup' | 'shutdown' | 'enable' | 'disable' | 'update' | 'sidecarSpawn' | 'scheduled'
/**
 * The extension is being removed. Its last chance to clean up.
 *
 * Without this there was no such chance, and combined with a storage API
 * that had no delete, an uninstalled extension's data was immortal — the
 * same orphan problem the media cleanup tool exists to solve, one layer up.
 *
 * Best-effort by construction: the host removes the extension's namespace
 * afterwards regardless, so a hook that throws, hangs or was never
 * registered costs nothing. It exists for the work core *cannot* do on an
 * extension's behalf — retiring a sidecar's external state, revoking a
 * token it issued — not for deleting its own rows.
 */
 | 'uninstall';
export type EventHook = (surface: EventHookSurface) => Result | Promise<Result>;
export type LifecycleHook = (surface: LifecycleHookSurface) => Result | Promise<Result>;
/**
 * F32, checked rather than documented. The probe reads the surface an implementation
 * actually hands out — a regression that adds `callProvider` back fails here instead
 * of shipping.
 */
export declare function assertHookSurface(kind: 'event' | 'lifecycle', surface: object): {
    ok: true;
} | {
    ok: false;
    found: string[];
};
/**
 * The scheduled-work path, stated as code so it is discoverable from the SDK rather
 * than only from 13 §7c.
 */
export declare const SCHEDULED_WORK_PATH: {
    readonly instead: 'core:event/schedule-tick@1';
    readonly because: string;
};
