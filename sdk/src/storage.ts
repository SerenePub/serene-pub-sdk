/**
 * What an extension may do with its own data.
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
 * ## Files, and the session's annex
 *
 * An extension's files are bytes on disk, jailed to its own directory, for what a session
 * row is the wrong home for: a downloaded index, a cache, a generated artifact, hidden state
 * only its own handlers read. What a session should keep — and take back with a turn — is an
 * annex field (`annexField`, `set-session-annex@1`), which core can check, show and retract.
 * There is no row store: what core cannot see inside, it cannot check, show or take back.
 * @ruling 13 §7c
 */

import type { Result } from './executor.js'

// ── Quota ───────────────────────────────────────────────────────────────────

/** @experimental */
export interface StorageUsage {
	/** The ceiling, from the manifest's `storage.quotaBytes`. */
	quotaBytes: number
	/** The extension's files, as currently stored. */
	usedBytes: number
	/** `quotaBytes - usedBytes`, floored at zero — precomputed because every
	 *  caller wants it and a subtraction is where an off-by-one lives. */
	availableBytes: number
}

/**
 * What a write reports back.
 *
 * A write that would exceed the quota returns `err` — it does not throw, and it
 * does not partially apply. The usage figures come back either way so a caller
 * can prune and retry without a second round trip.
 * @experimental
 */
export interface WriteReceipt {
	/** Bytes this write added (negative when it replaced something larger). */
	deltaBytes: number
	usage: StorageUsage
}

// ── Files ───────────────────────────────────────────────────────────────────

/** @experimental */
export interface FileEntry {
	/** Relative to the extension's own directory. Never absolute, never
	 *  escaping it — the host rejects `..` rather than normalising it. */
	path: string
	bytes: number
	/** ISO. */
	updatedAt: string
}

/**
 * The extension's own directory on disk.
 *
 * Jailed the same way plugin storage and media already are: paths are relative,
 * containment is asserted by the host, and nothing an extension supplies
 * reaches a filesystem call unchecked.
 * @experimental
 */
export interface ExtensionFiles {
	list(prefix?: string): Promise<FileEntry[]>
	stat(path: string): Promise<FileEntry | null>
	read(path: string): Promise<Result<Uint8Array>>
	write(path: string, bytes: Uint8Array): Promise<Result<WriteReceipt>>
	delete(path: string): Promise<Result<WriteReceipt>>
	/** Everything under a prefix. Returns how many were removed. */
	deleteAll(prefix?: string): Promise<Result<{ removed: number; usage: StorageUsage }>>
}

// ── The surface ─────────────────────────────────────────────────────────────

/** @experimental */
export interface ExtensionStorage {
	/** Ask, at any time. Cheap enough to call before a large write. */
	usage(): Promise<StorageUsage>
	/** The extension's own directory: everything it keeps beyond the session's annex. */
	files: ExtensionFiles
}

/** Nothing here reaches outside the extension's own namespace, so there is no
 *  capability to grant and nothing to put on a consent screen: an extension
 *  managing its own files is not a permission, it is housekeeping. 
 * @experimental
 */
export const STORAGE_IS_UNPRIVILEGED = true as const
