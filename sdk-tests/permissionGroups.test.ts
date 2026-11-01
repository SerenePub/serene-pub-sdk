/**
 * M2b permission groups the packager emits: each declaration compiles to its key;
 * a package declaring none emits the same permissions; the two refusals fire.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineExtension } from '@serene-pub/sdk'
import { compilePlugin, type CompileResult } from '../cli/src/compiler.js'

const SLUG = 'acme.lab'
const build = (extra: Record<string, unknown>): CompileResult =>
	compilePlugin({
		sources: [{ path: 'index.ts', text: '' }],
		// Assigned after `defineExtension`, which would refuse a bare widget or genre: the packager checks these.
		extension: Object.assign(defineExtension({ slug: SLUG, name: 'Lab', version: '0.1.0' }), extra) as never,
	})
const keys = (r: CompileResult) => {
	assert.ok(r.manifest, JSON.stringify(r.findings.map((f) => [f.code, f.message])))
	return (r.manifest as unknown as { permissions: string[] }).permissions
}
const codes = (r: CompileResult) => r.findings.map((f) => f.code)

describe('permission groups compile to keys', () => {
	test('session scopes, applet grants and per-user storage', () => {
		const r = build({
			permissions: {
				session: { scopes: ['session:state'] },
				applet: {
					characters: 'write',
					lorebooks: 'read',
					annex: { user: true },
				},
				storage: { perUser: { quotaBytes: 4096 } },
			},
		})
		const k = keys(r)
		for (const want of [
			'widget:session:state',
			'applet:characters:write',
			'applet:lorebooks:read',
			'applet:annex:user',
			'storage-per-user:4096',
		])
			assert.ok(k.includes(want), want)
	})

	test('an own genre compiles to one applet:sessions key, and is not foreign', () => {
		// A bare genre is incomplete (no create pipeline), so the manifest is withheld;
		// the finding list still shows the id was accepted as the package's own.
		const id = `${SLUG}:genre/one@1`
		const r = build({ genres: [{ id, name: 'One' }], permissions: { applet: { sessions: { genres: [id] } } } })
		assert.equal(codes(r).includes('E_APPLET_FOREIGN_GENRE'), false)
	})

	test('per-user storage without a quota is the bare key', () => {
		const k = keys(build({ permissions: { storage: { perUser: {} } } }))
		assert.ok(k.includes('storage-per-user'))
		assert.equal(k.includes('storage'), false, 'per-user alone does not ask for the pub-wide folder')
	})

	test('a package declaring none emits none of them', () => {
		const k = keys(build({}))
		assert.deepEqual(k.filter((p) => p.startsWith('applet:') || p.startsWith('storage-per-user')), [])
	})
})

describe('permission group refusals', () => {
	test('E_APPLET_FOREIGN_GENRE', () => {
		const r = build({ permissions: { applet: { sessions: { genres: ['other.pkg:genre/x@1'] } } } })
		assert.ok(codes(r).includes('E_APPLET_FOREIGN_GENRE'))
	})
	test('E_APPLET_WITHOUT_FRAME: an applet genre opens this package\'s own session-view frame', () => {
		const g = (view: string) => ({ id: `${SLUG}:genre/a@1`, name: 'A', shape: { view, applet: true } })
		const frame = { 'session-view': { entry: 'ui/a.html', title: 'A' } }
		assert.ok(codes(build({ genres: [g('other.pkg')], surfaces: frame })).includes('E_APPLET_WITHOUT_FRAME'))
		assert.ok(codes(build({ genres: [g(SLUG)] })).includes('E_APPLET_WITHOUT_FRAME'))
		assert.equal(codes(build({ genres: [g(SLUG)], surfaces: frame })).includes('E_APPLET_WITHOUT_FRAME'), false)
	})
	test('E_APPLET_ON_WIDGET: an applet scope, and applet on a widget', () => {
		const a = build({ widgets: [{ id: `${SLUG}:widget/w@1`, name: 'W', scopes: ['applet:characters'] }] })
		assert.ok(codes(a).includes('E_APPLET_ON_WIDGET'))
		const b = build({ widgets: [{ id: `${SLUG}:widget/w@1`, name: 'W', applet: true }] })
		assert.ok(codes(b).includes('E_APPLET_ON_WIDGET'))
	})
	test("E_PLUGIN_LIBRARY_WRITES: a plugin genre declaring writes.library is refused (ruling b1': core genres' for now)", () => {
		const lib = build({ genres: [{ id: `${SLUG}:genre/desk@1`, name: 'Desk', shape: { writes: { library: { characters: true } } } }] })
		const f = lib.findings.find((x) => x.code === 'E_PLUGIN_LIBRARY_WRITES')
		assert.ok(f)
		assert.match(f!.message, /library writes are core genres' for now/)
		// declared off, or not at all: no finding
		assert.equal(codes(build({ genres: [{ id: `${SLUG}:genre/desk@1`, name: 'Desk', shape: { writes: { library: { characters: false } } } }] })).includes('E_PLUGIN_LIBRARY_WRITES'), false)
	})
})
