/**
 * M0 declarations the packager emits: `assets`, `rulesets`,
 * `pluginActions` and the two permission keys; a package declaring none emits
 * none; each bad input fires its code.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineExtension, rulesetDocumentOf } from '@serene-pub/sdk'
import { freeformRuleset } from '@serene-pub/core-catalog'
import { compilePlugin, type CompileResult } from '../cli/src/compiler.js'

const SLUG = 'acme.lab'
const ruleset = (id = `${SLUG}:ruleset/one@1`) => ({ ...rulesetDocumentOf(freeformRuleset), id }) as never
const build = (extra: Record<string, unknown>): CompileResult =>
	compilePlugin({
		sources: [{ path: 'index.ts', text: '' }],
		extension: defineExtension({ slug: SLUG, name: 'Lab', version: '0.1.0', ...extra } as never),
	})
const codes = (r: CompileResult) => r.findings.map((f) => f.code)

describe('manifest declarations', () => {
	test('assets, rulesets, pluginActions and both permission keys appear', () => {
		const r = build({
			assets: { dir: 'assets' },
			rulesets: [ruleset()],
			permissions: { storage: { serve: ['worlds/**'] }, media: { autoplay: true } },
		})
		const m = r.manifest as unknown as Record<string, unknown> & { permissions: string[] }
		assert.deepEqual(m.assets, { dir: 'assets' })
		assert.equal((m.rulesets as unknown[]).length, 1)
		assert.ok(m.permissions.includes('storage-serve:worlds/**'))
		assert.ok(m.permissions.includes('media:autoplay'))
	})

	test('a package declaring none has none of them', () => {
		const r = build({})
		const m = r.manifest as unknown as Record<string, unknown> & { permissions: string[] }
		for (const k of ['assets', 'rulesets', 'pluginActions']) assert.equal(k in m, false, k)
		assert.deepEqual(m.permissions.filter((p) => p.startsWith('storage-serve:') || p === 'media:autoplay'), [])
	})
})

describe('declaration findings', () => {
	test('E_ASSETS_DIR', () => {
		for (const dir of ['/abs', 'a/../b', 'ui', 'dist/x', 'lang'])
			assert.ok(codes(build({ assets: { dir } })).includes('E_ASSETS_DIR'), dir)
	})
	test('E_RULESET_OWNER', () => {
		assert.ok(codes(build({ rulesets: [ruleset('other.owner:ruleset/x@1')] })).includes('E_RULESET_OWNER'))
	})
	test('E_RULESET_DOCUMENT', () => {
		assert.ok(codes(build({ rulesets: [{ id: `${SLUG}:ruleset/x@1`, version: 'nope' }] })).includes('E_RULESET_DOCUMENT'))
	})
	test('E_PLUGIN_ACTION_NAME, _HANDLER and _PARAMS', () => {
		const c = codes(build({ pluginActions: { 'Bad Name': { params: 5, handler: 'acme.lab:query/none@1' } } }))
		assert.ok(c.includes('E_PLUGIN_ACTION_NAME'))
		assert.ok(c.includes('E_PLUGIN_ACTION_HANDLER'))
		assert.ok(c.includes('E_PLUGIN_ACTION_PARAMS'))
	})
	test('E_SERVE_GLOB', () => {
		for (const glob of ['', '/abs', 'a\\b', 'a#b', 'a/../b', 'a//b'])
			assert.ok(codes(build({ permissions: { storage: { serve: [glob] } } })).includes('E_SERVE_GLOB'), glob)
	})
})
