/**
 * The docs playground — the half of it that has no DOM in it.
 *
 * The playground's claim to a reader is narrow and total: *the code on this
 * page is the code that ran, and pressing Run gets you the page's own output
 * back*. A browser test could only check that something appeared; what has to
 * be checked is that the three real example modules — the same files on disk
 * that the generator executes to make the pages — go through the playground's
 * own transpile, its own module map and its own run path and come out with the
 * receipt the golden pins and the text the page prints.
 *
 * So `playground/src/runner.ts` carries no `document`, and this file imports it
 * directly. If someone puts DOM in it, this suite stops compiling, which is the
 * intended alarm.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { renderExampleDocs } from '@serene-pub/cli'
import type { Golden } from '@serene-pub/sdk/testing'

import {
	PLAYGROUND_MODULES,
	UnknownModuleError,
	evaluateModule,
	resolveModule,
	runProgram,
	runSource,
	transpile,
} from '../playground/src/runner.js'

const EXAMPLES_DIR = join(import.meta.dirname, 'examples')
const GOLDENS_DIR = join(EXAMPLES_DIR, 'goldens')

const SLUGS = ['echo-reply', 'retrieved-reply', 'spoken-reply']

const sourceOf = (slug: string) => readFile(join(EXAMPLES_DIR, `${slug}.example.ts`), 'utf8')

const goldenOf = async (slug: string): Promise<Golden> =>
	JSON.parse(await readFile(join(GOLDENS_DIR, `${slug}.golden.json`), 'utf8'))

/** The suite runs under tsx, which can import a `.ts` example. */
const load = (path: string) => import(path)

describe('the playground module map', () => {
	test('every specifier an example imports resolves to something real', () => {
		for (const specifier of [
			'@serene-pub/sdk',
			'@serene-pub/sdk/testing',
			'@serene-pub/contracts',
			'@serene-pub/core-catalog',
			'@serene-pub/cli',
			'../helpers.js',
			'./helpers.js',
		]) {
			assert.equal(typeof resolveModule(specifier), 'object', specifier)
		}
		// `../helpers.js` and `./helpers.js` are the fixture host, not two of it.
		assert.equal(resolveModule('../helpers.js'), resolveModule('./helpers.js'))
		// The fixture host really is the suite's — same bindings, same world.
		const fixtures = resolveModule('./helpers.js') as { bindings: () => object }
		assert.ok('core:oracle/generate-text@1' in fixtures.bindings())
	})

	test('anything else throws, naming what was asked for and what exists', () => {
		assert.throws(
			() => resolveModule('node:fs'),
			(e: unknown) => {
				assert.ok(e instanceof UnknownModuleError)
				assert.equal(e.specifier, 'node:fs')
				// Both halves matter: a reader has to learn what went wrong AND
				// what they could have written instead.
				assert.match(e.message, /cannot import 'node:fs'/)
				assert.match(e.message, /@serene-pub\/contracts/)
				return true
			},
		)
		// No network, and nothing that looks like a way to one.
		assert.throws(() => resolveModule('https://esm.sh/lodash'), UnknownModuleError)
		// A map is data, not a prototype chain to walk.
		assert.throws(() => resolveModule('toString'), UnknownModuleError)
	})

	test('the cli entry is an empty object, because only its type is ever imported', async () => {
		assert.deepEqual(PLAYGROUND_MODULES['@serene-pub/cli'], {})
		// The proof: an example's `import type { Example } from '@serene-pub/cli'`
		// is gone by the time anything could ask the map for it.
		const js = await transpile(await sourceOf('echo-reply'))
		assert.ok(!js.includes('@serene-pub/cli'), 'the type import was elided')
	})
})

describe('the playground runs the real examples', () => {
	for (const slug of SLUGS) {
		test(`${slug} transpiles, evaluates, builds and runs to its golden's nodes`, async () => {
			const exports = evaluateModule(await transpile(await sourceOf(slug)))
			assert.ok(exports.example, `${slug} exports an example`)

			const run = await runProgram(exports)
			assert.equal(run.status, 'ok', run.result)
			assert.ok(run.doc, 'the document is there for the Document and Graph panes')
			assert.ok(run.receipt)

			// The same run the golden pins: same nodes, in the same order, each
			// ending the same way. Anything less and the page and the
			// playground are two different claims about one file.
			const golden = await goldenOf(slug)
			assert.deepEqual(
				run.receipt!.nodes.map((n) => n.nodeKey),
				golden.nodes.map((n) => n.nodeKey),
			)
			assert.deepEqual(
				run.receipt!.nodes.map((n) => n.result),
				golden.nodes.map((n) => n.result),
			)
			assert.equal(run.receipt!.outcome, golden.outcome)
			// The fixed seed is the SDK's now, shared with the generator.
			assert.equal(run.receipt!.seed, golden.seed)
		})
	}

	test('the Result pane is the page, byte for byte', async () => {
		const { pages } = await renderExampleDocs({
			dir: EXAMPLES_DIR,
			goldensDir: GOLDENS_DIR,
			load,
		})
		const page = pages.find((p) => p.path === 'examples/echo-reply.md')!
		const section = /## What it produces\n\n```\n([\s\S]*?)\n```/.exec(page.markdown)
		assert.ok(section, 'the page has a "What it produces" section')

		const run = await runProgram(evaluateModule(await transpile(await sourceOf('echo-reply'))))
		assert.equal(run.result, section[1])
	})
})

describe('what the playground says when it cannot run something', () => {
	test('an import it does not have names the specifier rather than failing obscurely', async () => {
		// The binding has to be USED: the TypeScript transform drops an import
		// nothing references, which is the same rule that makes an example's
		// `import type { Example }` disappear before the map is consulted.
		const run = await runSource(
			["import { readFile } from 'node:fs/promises'", 'export default readFile', ''].join(
				'\n',
			),
		)
		assert.equal(run.status, 'error')
		assert.match(run.result, /node:fs\/promises/)
	})

	test('a module that exports nothing runnable says what to export', async () => {
		const run = await runSource('export const notAnExample = 1\n')
		assert.equal(run.status, 'error')
		assert.match(run.result, /Export `example`/)
		assert.match(run.result, /`default`/)
	})

	test('a thrown error comes back readable rather than swallowed', async () => {
		const run = await runSource("throw new Error('boom from the fence')\n")
		assert.equal(run.status, 'error')
		assert.match(run.result, /boom from the fence/)
	})

	test('a bare default export is built, validated and run on the fixture host', async () => {
		const run = await runSource(
			[
				"import { sessionEvents, slot, spec } from '@serene-pub/sdk'",
				"import * as C from '@serene-pub/contracts'",
				'',
				"export default spec('example:playground-default', { version: '1.0.0' })",
				"\t.inlet('input', C.userMessage.v1(), {",
				"\t\tgenre: 'core:genre/chat',",
				'\t\tevent: sessionEvents.messageRespond,',
				'\t})',
				"\t.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))",
				"\t.task('prompt', ($) => C.assemble.v2({ candidates: $.history.messages }))",
				"\t.oracle('generate', ($) =>",
				'\t\tC.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),',
				'\t)',
				"\t.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))",
				'',
			].join('\n'),
		)
		assert.equal(run.status, 'ok', run.result)
		assert.equal(run.doc?.id, 'example:playground-default')
		assert.match(run.result, /published, then ran on the fixture host/)
		assert.match(run.result, /outcome ok/)
		assert.deepEqual(
			run.receipt!.nodes.map((n) => n.nodeKey),
			['input', 'history', 'prompt', 'generate', 'save'],
		)
	})

	test('a spec that does not publish shows its findings instead of running', async () => {
		const run = await runSource(
			[
				"import { spec } from '@serene-pub/sdk'",
				"import * as C from '@serene-pub/contracts'",
				'',
				// The mistake 01 §3 exists to catch: raw text wired into a port
				// that takes an assembled context.
				"export default spec('example:playground-broken', { version: '1.0.0' })",
				"\t.inlet('input', C.userMessage.v1())",
				"\t.oracle('generate', ($) => C.generateText.v1({ context: $.input.text }))",
				"\t.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))",
				'',
			].join('\n'),
		)
		assert.equal(run.status, 'findings')
		assert.ok(run.findings?.length)
		assert.match(run.result, /does not publish/)
		// Every finding carries the way out, not just the complaint.
		assert.match(run.result, /fix: /)
		// It compiled, so the Document and Graph panes still have something.
		assert.equal(run.doc?.id, 'example:playground-broken')
		assert.equal(run.receipt, undefined)
	})
})
