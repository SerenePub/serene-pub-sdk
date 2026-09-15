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
/** Nothing here reaches outside the extension's own namespace, so there is no
 *  capability to grant and nothing to put on a consent screen: an extension
 *  managing its own rows is not a permission, it is housekeeping. */
export const STORAGE_IS_UNPRIVILEGED = true;
//# sourceMappingURL=storage.js.map