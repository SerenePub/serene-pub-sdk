/**
 * 🚧 (M2c) **Is this lorebook file one Serene Pub's importer would take?**
 *
 * A package may ship lorebooks (`ExtensionDecl.provides.lorebooks`); the app
 * imports each at enable through its own importer, and `serene-pub check`
 * refuses a file that importer would refuse. One validator, two callers: the
 * app's importer runs this first, so the packager and the app cannot disagree
 * about what a lorebook file is.
 *
 * Pure text in, sentences out (`[]` = the file is fine). It checks the
 * file-level shape only: size, JSON, nesting, the entries list, and the
 * ceilings on counts and lengths. It never touches a database.
 *
 * @experimental
 */

/** The ceilings an imported lorebook file is held to. Mirrors the app's `LOREBOOK_IMPORT_LIMITS`. @experimental */
export const LOREBOOK_FILE_LIMITS = {
	/** A lorebook file's text, in bytes. */
	fileBytes: 32 * 1024 * 1024,
	/** Pieces of data (objects, lists, strings, numbers) a file may parse to. */
	maxItems: 1_000_000,
	/** Levels of nesting. */
	maxDepth: 64,
	maxEntries: 5000,
	maxCharacters: 200,
	maxPersonas: 200,
	maxNarrativeNodes: 5000,
	maxNarrativeRelationships: 5000,
	maxKeysPerEntry: 1000,
	maxKeyChars: 2000,
	maxTextChars: 200_000,
	maxNameChars: 10_000,
	maxExtraJsonBytes: 64 * 1024,
	maxScenesPerHistoryEntry: 1000,
	maxStatRows: 20_000,
	maxStatJsonBytes: 64 * 1024,
} as const

const fmt = (n: number): string => n.toLocaleString('en')
const mb = (bytes: number): string => `${fmt(Math.max(1, Math.ceil(bytes / (1024 * 1024))))} MB`
const bytesOf = (s: string): number => new TextEncoder().encode(s).length

/** The nesting and size of a JSON text, measured without parsing it. Returns a sentence or undefined. */
function jsonShapeFinding(text: string): string | undefined {
	const { maxItems, maxDepth } = LOREBOOK_FILE_LIMITS
	let items = 1
	let depth = 0
	let opened = false
	for (let i = 0; i < text.length && items <= maxItems; i++) {
		const c = text.charCodeAt(i)
		if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) continue
		if (opened) {
			opened = false
			if (c !== 0x7d && c !== 0x5d) items++
		}
		if (c === 0x22) {
			let end = i
			for (;;) {
				end = text.indexOf('"', end + 1)
				if (end < 0) return undefined
				let slashes = 0
				while (text.charCodeAt(end - 1 - slashes) === 0x5c) slashes++
				if (slashes % 2 === 0) break
			}
			i = end
		} else if (c === 0x7b || c === 0x5b) {
			if (++depth > maxDepth)
				return `This lorebook file is nested more than ${fmt(maxDepth)} levels deep; Serene Pub reads up to ${fmt(maxDepth)}.`
			opened = true
		} else if (c === 0x7d || c === 0x5d) depth--
		else if (c === 0x2c) items++
	}
	return items > maxItems
		? `This lorebook file holds more than ${fmt(maxItems)} pieces of data; Serene Pub reads up to ${fmt(maxItems)}.`
		: undefined
}

/** Where a file's entries sit: a bare list, `entries` (list or SillyTavern's index object), or a card's `character_book`. */
function entriesOf(data: any): unknown[] {
	if (Array.isArray(data)) return data
	let entries = data?.entries
	if (entries && !Array.isArray(entries) && typeof entries === 'object') entries = Object.values(entries)
	if (Array.isArray(entries)) return entries
	const nested = data?.data?.character_book?.entries
	return Array.isArray(nested) ? nested : []
}

function entryFindings(entry: any, i: number): string[] {
	const L = LOREBOOK_FILE_LIMITS
	const out: string[] = []
	if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [`Entry ${i + 1} isn't an object, so Serene Pub can't read it.`]
	for (const field of ['name', 'comment'] as const) {
		const v = entry[field]
		if (typeof v === 'string' && v.length > L.maxNameChars)
			out.push(`Entry ${i + 1}'s name is ${fmt(v.length)} characters; Serene Pub reads up to ${fmt(L.maxNameChars)}.`)
	}
	const title = [entry.name, entry.comment].find((v): v is string => typeof v === 'string' && v.trim().length > 0)
	const label = title ? `Entry ${i + 1} (“${title.trim().length > 40 ? `${title.trim().slice(0, 39)}…` : title.trim()}”)` : `Entry ${i + 1}`
	const primary: unknown[] = Array.isArray(entry.keys) ? entry.keys : Array.isArray(entry.key) ? entry.key : []
	const secondaryRaw = entry.secondary_keys ?? entry.keysecondary
	const condition: unknown[] = Array.isArray(secondaryRaw) ? secondaryRaw : []
	for (const [keys, what] of [
		[primary, 'keys'],
		[condition, 'condition keys'],
	] as const) {
		if (keys.length > L.maxKeysPerEntry)
			out.push(`${label} has ${fmt(keys.length)} ${what}; Serene Pub reads up to ${fmt(L.maxKeysPerEntry)} per entry.`)
		const long = keys.find((k): k is string => typeof k === 'string' && k.length > L.maxKeyChars)
		if (long !== undefined)
			out.push(`${label} has a key ${fmt(long.length)} characters long; Serene Pub reads keys up to ${fmt(L.maxKeyChars)} characters.`)
	}
	if (typeof entry.content === 'string' && entry.content.length > L.maxTextChars)
		out.push(`${label}'s content is ${fmt(entry.content.length)} characters; Serene Pub reads up to ${fmt(L.maxTextChars)}.`)
	const ext = entry.extensions
	if (ext && typeof ext === 'object') {
		const { serenepub, ...foreign } = ext
		if (serenepub && typeof serenepub === 'object' && !Array.isArray(serenepub))
			for (const [key, v] of Object.entries(serenepub))
				if (typeof v === 'string' && v.length > L.maxNameChars)
					out.push(`${label}'s ${key} is ${fmt(v.length)} characters; Serene Pub reads up to ${fmt(L.maxNameChars)}.`)
		const bytes = bytesOf(JSON.stringify(foreign))
		if (bytes > L.maxExtraJsonBytes)
			out.push(`${label} carries ${fmt(Math.ceil(bytes / 1024))} KB of extra data; Serene Pub reads up to ${fmt(L.maxExtraJsonBytes / 1024)} KB per entry.`)
		const scenes = serenepub?.scenes
		if (Array.isArray(scenes) && scenes.length > L.maxScenesPerHistoryEntry)
			out.push(`Entry ${i + 1} has ${fmt(scenes.length)} scenes; Serene Pub reads up to ${fmt(L.maxScenesPerHistoryEntry)} per history entry.`)
	}
	return out
}

/**
 * The sentences that say why Serene Pub's importer would refuse this lorebook
 * file (its text), or `[]` when the file is fine.
 * @experimental
 */
export function lorebookFileFindings(text: string): string[] {
	const L = LOREBOOK_FILE_LIMITS
	if (typeof text !== 'string') return ['No lorebook file was sent.']
	const size = bytesOf(text)
	if (size > L.fileBytes) return [`This lorebook file is ${mb(size)}, larger than the ${mb(L.fileBytes)} Serene Pub will read.`]
	const shape = jsonShapeFinding(text)
	if (shape) return [shape]
	let data: any
	try {
		data = JSON.parse(text.replace(/^﻿/, ''))
	} catch {
		return ["This lorebook file isn't valid JSON, so Serene Pub can't read it."]
	}
	if (typeof data !== 'object' || data === null) return ['Lorebook data must be an object.']

	const out: string[] = []
	const entries = entriesOf(data)
	const serenepub = data?.extensions?.serenepub ?? data?.data?.character_book?.extensions?.serenepub
	const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
	if (entries.length > L.maxEntries)
		out.push(`Lorebook has too many entries (${entries.length}); the maximum supported is ${L.maxEntries}.`)
	if (count(serenepub?.characters) > L.maxCharacters)
		out.push(`Lorebook embeds too many characters (${count(serenepub?.characters)}); the maximum supported is ${L.maxCharacters}.`)
	if (count(serenepub?.personas) > L.maxPersonas)
		out.push(`Lorebook embeds too many personas (${count(serenepub?.personas)}); the maximum supported is ${L.maxPersonas}.`)
	const graph = serenepub?.narrativeGraph
	if (count(graph?.nodes) > L.maxNarrativeNodes)
		out.push(`Lorebook's narrative graph has too many nodes (${count(graph?.nodes)}); the maximum supported is ${L.maxNarrativeNodes}.`)
	if (count(graph?.relationships) > L.maxNarrativeRelationships)
		out.push(`Lorebook's narrative graph has too many relationships (${count(graph?.relationships)}); the maximum supported is ${L.maxNarrativeRelationships}.`)

	const book = data.character_book ?? data.data?.character_book ?? data
	if (typeof book?.name === 'string' && book.name.length > L.maxNameChars)
		out.push(`This lorebook's name is ${fmt(book.name.length)} characters; Serene Pub reads up to ${fmt(L.maxNameChars)}.`)
	if (typeof book?.description === 'string' && book.description.length > L.maxTextChars)
		out.push(`This lorebook's description is ${fmt(book.description.length)} characters; Serene Pub reads up to ${fmt(L.maxTextChars)}.`)

	if (entries.length <= L.maxEntries) entries.forEach((entry, i) => out.push(...entryFindings(entry, i)))

	const stats = serenepub?.stats
	if (stats && typeof stats === 'object') {
		const list = (key: 'configs' | 'values'): any[] => (Array.isArray(stats[key]) ? stats[key] : [])
		const rows = [...list('configs').map((row) => row?.config), ...list('values').map((row) => row?.value)]
		if (rows.length > L.maxStatRows)
			out.push(`This lorebook file holds ${fmt(rows.length)} stats; Serene Pub reads up to ${fmt(L.maxStatRows)}.`)
		else
			for (const payload of rows) {
				if (payload === undefined) continue
				const bytes = bytesOf(JSON.stringify(payload))
				if (bytes > L.maxStatJsonBytes)
					out.push(`One of this lorebook's stats is ${fmt(bytes)} bytes; Serene Pub reads up to ${fmt(L.maxStatJsonBytes)}.`)
			}
	}
	return out
}
