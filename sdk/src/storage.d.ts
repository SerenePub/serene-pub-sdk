/**
 * What an extension may do with its own data (13 §7c).
 *
 * The surface this replaces was `readOwnRows` / `writeOwnRows` and nothing
 * else, which composed into a one-way door: a quota was declared in the
 * manifest (`storage.quotaBytes`), writes returned `void` so exceeding it was
 * either an undocumented throw or a silent drop, and there was **no delete at
 * all**. An extension that filled its quota could neither find out nor recover.
 *
 * Three things fix that, and they are the three the API now has: usage is
 * *askable*, writes *report*, and everything that can be created can be
 * removed.
 *
 * ## Rows and files are separate on purpose
 *
 * Rows are small, queryable and live in the database with the rest of the
 * instance's state — they back up with it and restore with it. Files are bytes
 * on disk, jailed to the extension's own directory, for the things a row is the
 * wrong home for (a downloaded model index, a cache, a generated artifact).
 * Merging them would mean either putting megabytes in the database or putting
 * queryable state outside the backup.
 *
 * **Both count against one quota.** A single number is what an author can
 * reason about and what a consent screen can state; two budgets that can each
 * be under while the disk fills is the failure this avoids.
 */
import type { Result } from './executor.js';
export interface StorageUsage {
    /** The ceiling, from the manifest's `storage.quotaBytes`. */
    quotaBytes: number;
    /** Rows plus files, as currently stored. */
    usedBytes: number;
    /** `quotaBytes - usedBytes`, floored at zero — precomputed because every
     *  caller wants it and a subtraction is where an off-by-one lives. */
    availableBytes: number;
    /** The split, for an extension that wants to know which half to prune. */
    rowBytes: number;
    fileBytes: number;
}
/**
 * What a write reports back.
 *
 * A write that would exceed the quota returns `err` — it does not throw, and it
 * does not partially apply. The usage figures come back either way so a caller
 * can prune and retry without a second round trip.
 */
export interface WriteReceipt {
    /** Bytes this write added (negative when it replaced something larger). */
    deltaBytes: number;
    usage: StorageUsage;
}
/**
 * A row query, deliberately small.
 *
 * This is key-prefix and time filtering with a cursor, not a query language.
 * An extension needing joins or secondary indexes wants its own tables, which
 * is a different (and much bigger) conversation than "let a plugin keep some
 * state" — and a query language here would become a compatibility surface no
 * one can change.
 */
export interface RowQuery {
    /** Keys starting with this. Absent means every key. */
    prefix?: string;
    /** Written at or after this ISO timestamp. */
    since?: string;
    /** Written before this ISO timestamp. */
    until?: string;
    /** Page size. The host clamps it; ask for what you want. */
    limit?: number;
    /** From a previous page's `nextCursor`. */
    cursor?: string;
    /** Newest first by default — the order a log or a cache wants. */
    order?: 'newest' | 'oldest' | 'key';
}
export interface RowEntry<T = unknown> {
    key: string;
    value: T;
    bytes: number;
    /** ISO. */
    updatedAt: string;
}
export interface RowPage<T = unknown> {
    rows: RowEntry<T>[];
    /** Absent when this was the last page. */
    nextCursor?: string;
}
export interface FileEntry {
    /** Relative to the extension's own directory. Never absolute, never
     *  escaping it — the host rejects `..` rather than normalising it. */
    path: string;
    bytes: number;
    /** ISO. */
    updatedAt: string;
}
/**
 * The extension's own directory on disk.
 *
 * Jailed the same way plugin storage and media already are: paths are relative,
 * containment is asserted by the host, and nothing an extension supplies
 * reaches a filesystem call unchecked.
 */
export interface ExtensionFiles {
    list(prefix?: string): Promise<FileEntry[]>;
    stat(path: string): Promise<FileEntry | null>;
    read(path: string): Promise<Result<Uint8Array>>;
    write(path: string, bytes: Uint8Array): Promise<Result<WriteReceipt>>;
    delete(path: string): Promise<Result<WriteReceipt>>;
    /** Everything under a prefix. Returns how many were removed. */
    deleteAll(prefix?: string): Promise<Result<{
        removed: number;
        usage: StorageUsage;
    }>>;
}
export interface ExtensionStorage {
    /** Ask, at any time. Cheap enough to call before a large write. */
    usage(): Promise<StorageUsage>;
    get<T = unknown>(key: string): Promise<T | undefined>;
    /** Keys only — for an extension that wants to enumerate before reading. */
    keys(prefix?: string): Promise<string[]>;
    query<T = unknown>(q?: RowQuery): Promise<RowPage<T>>;
    put(key: string, value: unknown): Promise<Result<WriteReceipt>>;
    delete(key: string): Promise<Result<WriteReceipt>>;
    /** Everything under a prefix — the "get back under quota" and the
     *  "clean up after myself on uninstall" operation. */
    deleteAll(prefix?: string): Promise<Result<{
        removed: number;
        usage: StorageUsage;
    }>>;
    files: ExtensionFiles;
}
/** Nothing here reaches outside the extension's own namespace, so there is no
 *  capability to grant and nothing to put on a consent screen: an extension
 *  managing its own rows is not a permission, it is housekeeping. */
export declare const STORAGE_IS_UNPRIVILEGED: true;
