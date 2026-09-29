/**
 * D-7 — **the laws page is the conformance kit, rendered.**
 *
 * `/docs/sdk/laws` is built by `renderLawsDocs()` (cli/src/docsLaws.ts) from
 * `REQUIREMENTS`, so the documented guarantee and the executed one are the same
 * sentence: a requirement that changes changes the page, and a law nobody wrote
 * a consequence for cannot hide in prose. Nothing checked that until now — the
 * renderer had no test at all, so a requirement could be added to the kit and
 * silently miss the page an author reads.
 *
 * What is pinned: every requirement gets a section, in the kit's own order,
 * carrying its law and its consequence; and the six laws the showcase lanes hit
 * (plan §14 D-7) are on it by name, because "it holds in code and is on no
 * page" is exactly the state this page exists to end.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { REQUIREMENTS } from '@serene-pub/conformance'
import { renderLawsDocs } from '@serene-pub/cli'

const page = () => {
	const pages = renderLawsDocs()
	assert.equal(pages.length, 1, 'the laws source renders one page')
	assert.equal(pages[0]!.path, 'laws.md')
	return pages[0]!.markdown
}

describe('D-7 · every requirement reaches the laws page', () => {
	test('one section per requirement, in the kit’s order', () => {
		const md = page()
		const headings = [...md.matchAll(/^## (C\d+) — (.+)$/gm)]
		assert.deepEqual(
			headings.map((h) => h[1]),
			REQUIREMENTS.map((r) => r.id),
			'the page lists the requirements in the order the kit runs them',
		)
		assert.deepEqual(
			headings.map((h) => h[2]),
			REQUIREMENTS.map((r) => r.title),
			'a section’s heading is the requirement’s own statement, never a second wording of it',
		)
	})

	test('each section carries the law it comes from and what breaks without it', () => {
		const md = page()
		for (const r of REQUIREMENTS) {
			assert.ok(md.includes(`Law \`${r.law}\`.`), `${r.id}: the law it comes from`)
			assert.ok(
				md.includes(`**If a host breaks this:** ${r.consequence}`),
				`${r.id}: the consequence, verbatim — a red line reading '${r.id}' tells nobody what to look at`,
			)
		}
	})
})

describe('D-7 · the six laws the showcase lanes hit are on the page', () => {
	// Each one held in code and appeared on no page until the requirement
	// existed (plan §14 D-7, findings §10–§13).
	const added = {
		C21: /one live row per run/,
		C22: /no pipeline triggers another/,
		// The effects line at a block, and its one exception: the statement was
		// re-ruled on 2026-09-17 (L1) to carry the owner-addressed case, so the
		// phrase pinned here is the prohibition itself rather than the heading it
		// used to be written as.
		C23: /no message block may name it/,
		C24: /addressed by a form/,
		C25: /the plugin grant table/,
		C26: /no ambient authority/,
	}

	for (const [id, statement] of Object.entries(added))
		test(`${id} is rendered, with its statement`, () => {
			const md = page()
			const section = md.split(/^## /m).find((s) => s.startsWith(`${id} — `))
			assert.ok(section, `${id} has no section on the page`)
			assert.match(section!, statement)
			assert.match(section!, /\*\*If a host breaks this:\*\* .{40,}/)
		})
})
