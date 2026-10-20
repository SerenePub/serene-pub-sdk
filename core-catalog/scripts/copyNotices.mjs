/**
 * Licence notices ride beside the data they cover: every `LICENSE-*.md`
 * under `src/` is copied to the same place under `dist/` after `tsc`, which
 * copies the JSON it imports but never a notice. (Vis Itineris's compendium:
 * `src/rulesets/vis-itineris/compendium/LICENSE-CC-BY-4.0.md`.)
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')

for (const entry of await readdir(SRC, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile() || !/^LICENSE-.+\.md$/.test(entry.name)) continue
	const from = join(entry.parentPath, entry.name)
	const to = join(DIST, relative(SRC, from))
	await mkdir(dirname(to), { recursive: true })
	await copyFile(from, to)
}
