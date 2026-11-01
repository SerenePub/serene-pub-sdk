/**
 * The **user annex** (🚧 M2b, plan §7): one person's own JSON documents,
 * namespaced by owner (a package slug, or `core`). Rows keyed by
 * `(person, owner, key)`, each with a `version`, so a write can be a
 * compare-and-set: a stale write is refused WITH the fresh document, and no
 * update is lost silently.
 *
 * The person is always resolved by core (the presser, the sender, the viewer) —
 * never a user id a package names; there are no cross-person reads and no
 * listing of people. Core enforces the limits; a manifest is a request, never a
 * setting. A package declares its keys with `annexField({ scope: 'user', … })`.
 *
 * @experimental 🚧 provisional (M2b).
 */

/** What core enforces on a person's documents under one owner. @experimental */
export const USER_ANNEX_LIMITS = Object.freeze({
	/** The longest key, in characters. */
	keyMaxLength: 128,
	/** The most one document may take, as UTF-8 bytes of its JSON. */
	bytesPerDoc: 64 * 1024,
	/** The most documents one person may keep under one owner. */
	docsPerOwner: 256,
	/** The most bytes one person may keep under one owner, over every document. */
	bytesPerOwner: 1024 * 1024,
})

/** One stored document, as a package reads it. 🚧 (M2b) @experimental */
export interface UserAnnexEntryV1 {
	key: string
	doc: unknown
	/** 1 when first written; +1 on every write. The compare-and-set token. */
	version: number
	/** ISO time of the last write. */
	updatedAt: string
}

/** One row of a listing: no document, so a listing stays small. 🚧 (M2b) @experimental */
export interface UserAnnexListRowV1 {
	key: string
	version: number
	updatedAt: string
}

/**
 * The outcome of a write or a remove. `stale` carries the document as it is
 * now (null when it no longer exists); `refused` is a sentence. 🚧 (M2b)
 * @experimental
 */
export type UserAnnexWriteResult =
	| { ok: true; version: number }
	| { ok: false; stale: true; fresh: UserAnnexEntryV1 | null }
	| { ok: false; refused: string }

/** 🚧 (M2b) What `base` means: absent is last writer wins; a number is compare-and-set on the stored version (0 = "must not exist yet"). @experimental */
export interface UserAnnexWriteOptions {
	base?: number
}

/**
 * What the sandbox puts on `ctx` for the user annex (phase B). The person is
 * the acting one, resolved by core. 🚧 (M2b) @experimental
 */
export interface ExtensionUserAnnex {
	get(key: string): Promise<UserAnnexEntryV1 | null>
	set(key: string, doc: unknown, opts?: UserAnnexWriteOptions): Promise<UserAnnexWriteResult>
	list(prefix?: string): Promise<UserAnnexListRowV1[]>
	remove(key: string, opts?: UserAnnexWriteOptions): Promise<UserAnnexWriteResult>
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]*$/

/**
 * Why this is not a user annex key — a sentence — or null when it is. A key is
 * lowercase letters, digits and `. _ / -`, starts with a letter or digit, has
 * no `..`, no empty part, and does not begin or end with `/`. @experimental
 */
export function userAnnexKeyRefusal(key: unknown): string | null {
	if (typeof key !== 'string' || !key) return 'A user annex key is a non-empty piece of text.'
	if (key.length > USER_ANNEX_LIMITS.keyMaxLength)
		return `A user annex key is at most ${USER_ANNEX_LIMITS.keyMaxLength} characters; this one has ${key.length}.`
	if (key.startsWith('/') || key.endsWith('/')) return `A user annex key never begins or ends with '/': '${key}'.`
	if (key.includes('..') || key.includes('//'))
		return `A user annex key has no '..' and no empty part between slashes: '${key}'.`
	if (!KEY_PATTERN.test(key))
		return `A user annex key uses lowercase letters, digits and . _ / - only, starting with a letter or digit: '${key}'.`
	return null
}

/** Is `value` plain JSON data all the way down (no functions, undefined, symbols, bigints, class instances, cycles)? @internal */
function plainData(value: unknown, seen: Set<object>): boolean {
	if (value === null) return true
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return true
		case 'number':
			return Number.isFinite(value)
		case 'object': {
			if (seen.has(value as object)) return false
			seen.add(value as object)
			let ok: boolean
			if (Array.isArray(value)) ok = value.every((v) => plainData(v, seen))
			else {
				const proto = Object.getPrototypeOf(value)
				ok =
					(proto === Object.prototype || proto === null) &&
					Object.values(value as Record<string, unknown>).every((v) => plainData(v, seen))
			}
			seen.delete(value as object)
			return ok
		}
		default:
			return false
	}
}

/** UTF-8 byte length of a string, without Buffer (the SDK runs in sandboxes). @internal */
export function utf8Length(s: string): number {
	let n = 0
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i)
		if (c < 0x80) n += 1
		else if (c < 0x800) n += 2
		else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
			n += 4
			i++
		} else n += 3
	}
	return n
}

/**
 * The size of a document as the limits count it: UTF-8 bytes of its JSON.
 * Null when it is not plain data. @experimental
 */
export function userAnnexDocBytes(doc: unknown): number | null {
	if (doc === undefined || !plainData(doc, new Set())) return null
	return utf8Length(JSON.stringify(doc))
}

/**
 * Why this document cannot be stored — a sentence — or null when it can: plain
 * JSON data, at most `bytesPerDoc` UTF-8 bytes of JSON. @experimental
 */
export function userAnnexDocRefusal(doc: unknown): string | null {
	const bytes = userAnnexDocBytes(doc)
	if (bytes === null) return 'A user annex document is plain data (text, numbers, true/false, null, lists and objects of them).'
	if (bytes > USER_ANNEX_LIMITS.bytesPerDoc)
		return `A user annex document is at most ${USER_ANNEX_LIMITS.bytesPerDoc} bytes; this one is ${bytes}.`
	return null
}

/** One write a call buffered, for core to commit after the call returns. `doc: null` removes the key. 🚧 (M2b) @experimental */
export interface UserAnnexBufferedWrite {
	key: string
	/** The new document, or null to remove the key. */
	doc: unknown | null
	/** The version the call's snapshot held for this key (0 = absent): the commit's compare-and-set. */
	base: number
}

/** What a call's snapshot holds for one key. 🚧 (M2b) @experimental */
export interface UserAnnexSnapshotEntry {
	doc: unknown
	version: number
	updatedAt: string
}

/**
 * 🚧 (M2b) An in-memory `ExtensionUserAnnex` over a snapshot, with read-your-
 * writes: the semantics a hook sees inside a sandbox, and what an author's
 * harness uses. `base` is compared against the PROJECTED version (so a second
 * write in one call sees the first); the caps count the projection; a
 * successful write answers the projected version + 1. `writes()` is what the
 * call buffered — one entry per touched key (the last word), each with the
 * snapshot's version as its `base` — for the commit.
 *
 * A hook may not save a bare `null` document (`null` is how a buffered write
 * says "remove"): it is refused in words; use `remove`.
 * @experimental
 */
export function userAnnexProjection(
	snapshot: Record<string, UserAnnexSnapshotEntry> = {},
	now: () => string = () => new Date(0).toISOString(),
): { api: ExtensionUserAnnex; writes(): UserAnnexBufferedWrite[] } {
	const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))
	const proj = new Map<string, UserAnnexSnapshotEntry>()
	const baseOf = new Map<string, number>()
	for (const k of Object.keys(snapshot)) {
		proj.set(k, { doc: clone(snapshot[k]!.doc), version: snapshot[k]!.version, updatedAt: snapshot[k]!.updatedAt })
		baseOf.set(k, snapshot[k]!.version)
	}
	const touched: string[] = []
	const touch = (k: string) => {
		if (!touched.includes(k)) touched.push(k)
	}
	const entry = (k: string): UserAnnexEntryV1 | null => {
		const e = proj.get(k)
		return e ? { key: k, doc: clone(e.doc), version: e.version, updatedAt: e.updatedAt } : null
	}
	const stale = (k: string, base: number | undefined): UserAnnexWriteResult | null =>
		base !== undefined && base !== (proj.get(k)?.version ?? 0) ? { ok: false, stale: true, fresh: entry(k) } : null
	const capWhy = (): string | null => {
		if (proj.size > USER_ANNEX_LIMITS.docsPerOwner)
			return `This extension may keep at most ${USER_ANNEX_LIMITS.docsPerOwner} documents for one person.`
		let bytes = 0
		for (const e of proj.values()) bytes += userAnnexDocBytes(e.doc) ?? 0
		if (bytes > USER_ANNEX_LIMITS.bytesPerOwner)
			return `This extension may keep at most ${USER_ANNEX_LIMITS.bytesPerOwner} bytes of documents for one person; this would make ${bytes}.`
		return null
	}
	const api: ExtensionUserAnnex = {
		async get(key) {
			return entry(key)
		},
		async list(prefix) {
			return [...proj.keys()]
				.filter((k) => !prefix || k.startsWith(prefix))
				.sort()
				.map((k) => ({ key: k, version: proj.get(k)!.version, updatedAt: proj.get(k)!.updatedAt }))
		},
		async set(key, doc, opts) {
			const why = userAnnexKeyRefusal(key) ?? userAnnexDocRefusal(doc)
			if (why) return { ok: false, refused: why }
			if (doc === null)
				return { ok: false, refused: 'A hook cannot save a bare null document; use remove(key) to delete one.' }
			const s = stale(key, opts?.base)
			if (s) return s
			const before = proj.get(key)
			const next = { doc: clone(doc), version: (before?.version ?? 0) + 1, updatedAt: now() }
			proj.set(key, next)
			const cap = capWhy()
			if (cap) {
				if (before) proj.set(key, before)
				else proj.delete(key)
				return { ok: false, refused: cap }
			}
			touch(key)
			return { ok: true, version: next.version }
		},
		async remove(key, opts) {
			const why = userAnnexKeyRefusal(key)
			if (why) return { ok: false, refused: why }
			const s = stale(key, opts?.base)
			if (s) return s
			const before = proj.get(key)
			if (!before) return { ok: true, version: 0 }
			proj.delete(key)
			touch(key)
			return { ok: true, version: before.version }
		},
	}
	return {
		api,
		writes() {
			return touched.map((k) => ({
				key: k,
				doc: proj.has(k) ? clone(proj.get(k)!.doc) : null,
				base: baseOf.get(k) ?? 0,
			}))
		},
	}
}

/**
 * The `ctx.annex` function a hook finds: `ctx.annex('user')` answers the acting
 * person's annex; any other host throws naming the hosts. 🚧 (M2b)
 * @experimental
 */
export type HookAnnex = (host: 'user') => ExtensionUserAnnex
