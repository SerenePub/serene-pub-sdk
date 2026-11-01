/**
 * `serene-pub check`'s string-catalog report (M0, SHAPES L5): for each
 * `lang/<locale>.json`, how many keys it holds, how many no source names, and
 * how many of the package's `t('…')` literals it lacks.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const T_CALL = /\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.|\$(?!\{))*)`)/g

const unescape = (s: string): string => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))

export async function langCatalogReport(dir: string, sourceTexts: ReadonlyArray<string>): Promise<string[]> {
	let files: string[]
	try {
		files = (await readdir(join(dir, 'lang'))).filter((f) => f.endsWith('.json')).sort()
	} catch {
		return []
	}
	if (!files.length) return []
	const literals = new Set<string>()
	for (const text of sourceTexts) {
		for (const m of text.matchAll(T_CALL)) literals.add(unescape(m[1] ?? m[2] ?? m[3] ?? ''))
	}
	const lines: string[] = []
	for (const file of files) {
		let parsed: unknown
		try {
			parsed = JSON.parse(await readFile(join(dir, 'lang', file), 'utf8'))
		} catch {
			parsed = undefined
		}
		const ok =
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed) &&
			Object.values(parsed as object).every((v) => typeof v === 'string')
		if (!ok) {
			lines.push(`lang/${file}: not a JSON object of strings`)
			continue
		}
		const keys = new Set(Object.keys(parsed as object))
		const locale = file.replace(/\.json$/, '').toLowerCase()
		const unused = [...keys].filter((k) => !literals.has(k)).length
		const untranslated = [...literals].filter((l) => !keys.has(l)).length
		lines.push(`lang/${locale}.json: ${keys.size} keys · ${unused} unused · ${untranslated} UI strings untranslated`)
	}
	return lines.sort()
}
