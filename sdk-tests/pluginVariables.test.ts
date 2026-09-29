/**
 * A package's context variables travel in its manifest (typed templates,
 * 2026-09-27). `definePluginVariable` registers only in the plugin's own
 * process; an instance knew none of them, so every plugin band was
 * unregistered there and law T1 refused the plugin's specs at install. The
 * packager now emits `manifest.variables` — the declared list plus every
 * variable a band of the package's definitions holds — and refuses `core:`
 * and foreign namespaces.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	S,
	_withdrawVariable,
	defineExtension,
	definePluginVariable,
	describeTaskDefinition,
	getVariable,
	handler,
	pluginVariableFindings,
	variablesOf,
	type VariableDecl,
} from '@serene-pub/sdk'
import { compilePlugin } from '@serene-pub/cli'

const NS = 'vartest.pkg'

const varSecret = definePluginVariable(NS, {
	id: `${NS}:var/secret@1`,
	i18n: { name: { en: 'Secret' } },
	description: { en: 'The secret.' },
	scope: { secret: { type: 'string' } },
	sample: 'a clocktower',
})

const varExtra = definePluginVariable(NS, {
	id: `${NS}:var/extra@1`,
	scope: { extra: { type: 'string' } },
	sample: 'x',
})

const pick = describeTaskDefinition({
	id: `${NS}:task/pick@1`,
	timeoutMs: 500,
	bands: { secret: varSecret },
	ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
})
const pick2 = describeTaskDefinition({
	id: `${NS}:task/pick-again@1`,
	timeoutMs: 500,
	bands: { secret: varSecret },
	ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
})
const noop = () => ({ ok: true as const, value: { main: {}, candidates: [] } })

const ext = (variables?: VariableDecl[]) =>
	defineExtension({
		slug: NS,
		name: 'Vars',
		version: '1.0.0',
		handlers: [handler(pick, noop as never), handler(pick2, noop as never)],
		...(variables ? { variables } : {}),
	})

describe('variablesOf', () => {
	test("collects every band's variable once, after the declared list", () => {
		const got = variablesOf(ext([varExtra]))
		assert.deepEqual(
			got.map((v) => v.id),
			[`${NS}:var/extra@1`, `${NS}:var/secret@1`],
		)
	})
	test('a declared variable that a band also holds is one entry', () => {
		assert.equal(variablesOf(ext([varSecret])).length, 1)
	})
	test('a band naming its variable by id is a reference, not a declaration', () => {
		assert.deepEqual(
			variablesOf({
				// A registry row's shape: the band as its variable's id.
				handlers: [
					{ __decl: 'handler', type: { bands: { secret: `${NS}:var/secret@1` } } } as never,
				],
			}),
			[],
		)
	})
})

describe('pluginVariableFindings / defineExtension', () => {
	test('refuses core: and foreign namespaces, naming the fix', () => {
		const f = pluginVariableFindings(NS, [
			{ id: 'core:var/secret@1', scope: { secret: 'any' }, sample: 1 },
			{ id: 'other.pkg:var/secret@1', scope: { secret: 'any' }, sample: 1 },
		])
		assert.equal(f.length, 2)
		assert.match(f[0]!, /'core:' namespace is reserved.*'vartest\.pkg:var\/secret@1'/)
		assert.match(f[1]!, /not in this package's namespace/)
	})
	test('refuses one id with two contents', () => {
		const f = pluginVariableFindings(NS, [
			{ id: `${NS}:var/a@1`, scope: { a: 'any' }, sample: 1 },
			{ id: `${NS}:var/a@1`, scope: { a: 'any' }, sample: 2 },
		])
		assert.match(f.join('\n'), /declared twice with different content/)
	})
	test('defineExtension refuses a foreign variable', () => {
		assert.throws(
			() => ext([{ id: 'core:var/characters@1', scope: { characters: 'any' }, sample: [] }]),
			/'core:' namespace is reserved/,
		)
	})
})

describe('the packager emits manifest.variables', () => {
	const packaged = (variables?: VariableDecl[]) =>
		compilePlugin({
			sources: [{ path: 'index.ts', text: `export default defineExtension({ slug: '${NS}' })` }],
			extension: ext(variables),
		})

	test('the declared list and the bands’ variables, verbatim', () => {
		const r = packaged([varExtra])
		assert.equal(r.ok, true)
		assert.deepEqual(
			r.manifest?.variables?.map((v) => v.id),
			[`${NS}:var/extra@1`, `${NS}:var/secret@1`],
		)
		const secret = r.manifest!.variables!.find((v) => v.id === varSecret.id)!
		assert.deepEqual(JSON.parse(JSON.stringify(secret)), {
			id: varSecret.id,
			i18n: { name: { en: 'Secret' } },
			description: { en: 'The secret.' },
			scope: { secret: { type: 'string' } },
			sample: 'a clocktower',
		})
	})

	test('a package with no variables emits no key', () => {
		const r = compilePlugin({
			sources: [{ path: 'index.ts', text: `export default defineExtension({ slug: '${NS}' })` }],
			extension: defineExtension({ slug: NS, name: 'Vars', version: '1.0.0' }),
		})
		assert.equal(r.ok, true)
		assert.equal('variables' in r.manifest!, false)
	})
})

describe('_withdrawVariable', () => {
	test('a host takes a plugin variable back out, and re-registers the same one', () => {
		const decl = definePluginVariable(NS, {
			id: `${NS}:var/withdrawn@1`,
			scope: { w: { type: 'string' } },
			sample: 'w',
		})
		assert.equal(_withdrawVariable(decl.id), true)
		assert.equal(getVariable(decl.id), undefined)
		definePluginVariable(NS, decl as never)
		// identical redeclare is idempotent
		definePluginVariable(NS, decl as never)
		assert.ok(getVariable(decl.id))
	})
	test("refuses core's", () => {
		assert.throws(() => _withdrawVariable('core:var/characters@1'), /core's/)
		assert.ok(getVariable('core:var/characters@1'))
	})
})
