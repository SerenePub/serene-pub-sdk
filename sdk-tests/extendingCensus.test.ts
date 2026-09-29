/**
 * The seam census (R37, F1) cannot rot.
 *
 * `guides/extending.md` lists every extension point with the tests that run
 * its implementations, each as `` `file` › `test name` ``. This suite reads
 * those tables and holds each reference to the file it names: the file
 * exists, and a `test(`, `it(` or `describe(` in it carries that exact title.
 * Renaming or deleting a test the census names fails here, so the guide is
 * edited in the same change.
 *
 * `sdk-tests/…` paths resolve against this repository. `serene-pub/…` paths
 * are the app's, resolved against `SERENE_PUB_APP` or the sibling checkout
 * `../serene-pub`. When the app is not checked out beside the SDK, those
 * references are skipped, and the skip says so. It is never a silent pass.
 *
 * This proves that each named test exists. Whether it passes is its own
 * suite's business: `sdk-tests` for the SDK's, the app's `npm test` for the
 * app's.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SDK_ROOT = resolve(import.meta.dirname, '..')
const GUIDE = join(SDK_ROOT, 'guides', 'extending.md')
const APP_ROOT = resolve(process.env.SERENE_PUB_APP ?? join(SDK_ROOT, '..', 'serene-pub'))
const APP_PRESENT = existsSync(join(APP_ROOT, 'src'))

interface TestRef {
	/** As written in the guide: `sdk-tests/…` or `serene-pub/…`. */
	file: string
	name: string
}

interface CensusRow {
	seam: string
	stability: string
	implementations: string
	tests: TestRef[]
}

/** One reference: a code span naming the file, `›`, a code span naming the test. */
const REF = /`((?:sdk-tests|serene-pub)\/[^`]+)`\s*›\s*`([^`]+)`/g

/** The census rows: every table row after a `| Seam |` header, in both tables. */
function readCensus(): CensusRow[] {
	const rows: CensusRow[] = []
	let inTable = false
	for (const line of readFileSync(GUIDE, 'utf8').split('\n')) {
		if (/^\|\s*Seam\s*\|/.test(line)) {
			inTable = true
			continue
		}
		if (!line.startsWith('|')) {
			inTable = false
			continue
		}
		if (!inTable || /^\|\s*-{3}/.test(line)) continue
		const cells = line.split(/\s\|\s/).map((c) => c.replace(/^\|\s*|\s*\|$/g, '').trim())
		assert.equal(cells.length, 4, `census row has ${cells.length} cells, not 4: ${line.slice(0, 80)}…`)
		const [seam, stability, implementations, testsCell] = cells as [string, string, string, string]
		rows.push({
			seam: seam.replace(/\*\*/g, ''),
			stability,
			implementations,
			tests: [...testsCell.matchAll(REF)].map((m) => ({ file: m[1]!, name: m[2]! })),
		})
	}
	return rows
}

const resolveRef = (file: string): string =>
	file.startsWith('serene-pub/') ? join(APP_ROOT, file.slice('serene-pub/'.length)) : join(SDK_ROOT, file)

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does the source declare a test, `it` or `describe` titled exactly `name`, in any quote style? */
function declaresTest(source: string, name: string): boolean {
	const title = escapeRegExp(name)
	return new RegExp(`\\b(?:test|it|describe)(?:\\.\\w+)?\\(\\s*(['"\`])${title}\\1`).test(source)
}

const census = readCensus()

describe('the seam census (guides/extending.md)', () => {
	test('has rows, and every row names at least one test', () => {
		assert.ok(census.length >= 20, `only ${census.length} census rows were read — did the table format change?`)
		for (const row of census) assert.ok(row.tests.length, `seam '${row.seam}' names no test`)
	})

	test("lists at least the seams R37 names", () => {
		const seams = census.map((r) => r.seam.toLowerCase()).join('\n')
		for (const required of [
			'component frameworks',
			'renderer',
			'component mount points',
			'preview-harness targets',
			'node kinds',
			'turn strategies',
			'venues',
			'provisional node definitions',
		])
			assert.ok(seams.includes(required), `the census has no row for '${required}'`)
	})

	test('every row states its stability as a tag, or marks itself provisional', () => {
		for (const row of census)
			assert.match(row.stability, /@public|@experimental|🚧/, `seam '${row.seam}' states no stability`)
	})

	test('a seam that ships nothing is not frozen', () => {
		for (const row of census)
			if (/^\*\*None\.\*\*/.test(row.implementations))
				assert.doesNotMatch(
					row.stability,
					/@public/,
					`seam '${row.seam}' has no implementation and is @public — build it once or tag it @experimental (R37)`,
				)
	})
})

for (const row of census) {
	describe(`census · ${row.seam}`, () => {
		for (const ref of row.tests) {
			const app = ref.file.startsWith('serene-pub/')
			const skip = app && !APP_PRESENT ? `the app is not checked out at ${APP_ROOT}` : false
			test(`${ref.file} › ${ref.name}`, { skip }, () => {
				const path = resolveRef(ref.file)
				assert.ok(existsSync(path), `${ref.file} does not exist (seam '${row.seam}')`)
				assert.ok(
					declaresTest(readFileSync(path, 'utf8'), ref.name),
					`${ref.file} has no test named '${ref.name}' (seam '${row.seam}') — update guides/extending.md with the test's new name`,
				)
			})
		}
	})
}
