import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { langCatalogReport } from '../cli/src/langCatalogs.js'

async function pkg(files: Record<string, string>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'lang-catalogs-'))
	await mkdir(join(dir, 'lang'), { recursive: true })
	for (const [name, text] of Object.entries(files)) await writeFile(join(dir, 'lang', name), text)
	return dir
}

const SRC = [`ctx.t('Save'); ctx.t("Cancel {0}"); ctx.t(\`Open\`); ctx.t(\`x \${y}\`)`]

test('one line per locale, in the exact format, sorted', async () => {
	const dir = await pkg({
		'pt-br.json': JSON.stringify({ Save: 'Salvar', 'Cancel {0}': 'Cancelar {0}', Open: 'Abrir' }),
		'es.json': JSON.stringify({ Save: 'Guardar' }),
	})
	try {
		assert.deepEqual(await langCatalogReport(dir, SRC), [
			'lang/es.json: 1 keys · 0 unused · 2 UI strings untranslated',
			'lang/pt-br.json: 3 keys · 0 unused · 0 UI strings untranslated',
		])
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('unused keys and untranslated literals are counted', async () => {
	const dir = await pkg({ 'fr.json': JSON.stringify({ Save: 'Enregistrer', Gone: 'Parti', Gone2: 'Parti2' }) })
	try {
		assert.deepEqual(await langCatalogReport(dir, SRC), [
			'lang/fr.json: 3 keys · 2 unused · 2 UI strings untranslated',
		])
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a malformed file gets its own line', async () => {
	const dir = await pkg({ 'de.json': '[1,2]', 'it.json': '{nope' , 'nl.json': JSON.stringify({ Save: 1 }) })
	try {
		assert.deepEqual(await langCatalogReport(dir, SRC), [
			'lang/de.json: not a JSON object of strings',
			'lang/it.json: not a JSON object of strings',
			'lang/nl.json: not a JSON object of strings',
		])
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('no lang/ directory reports nothing', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'lang-catalogs-'))
	try {
		assert.deepEqual(await langCatalogReport(dir, SRC), [])
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})
