/**
 * C30 (§3.5): a built component is judged on what it carries, a host's round
 * trip is held to the protocol, and each half fails loudly on a host or a
 * module that gets it wrong.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { componentModuleFindings } from '../sdk/src/componentModule.js'
import {
	COMPONENT_PROTOCOL_FIXTURE,
	componentProtocolCase,
	judgeComponentModule,
	type ComponentView,
} from '../conformance/src/components.js'
import { mountCode } from './componentMount.js'

test('a built module is judged: renderer, own worker and bare imports fail; unknown elements are said', () => {
	assert.deepEqual(componentModuleFindings(COMPONENT_PROTOCOL_FIXTURE).errors, [])
	assert.match(componentModuleFindings(`import x from '@remote-dom/core'\n`).errors.join(), /renderer/)
	assert.match(componentModuleFindings(`new Worker('x.js')\n`).errors.join(), /worker of its own/)
	assert.match(componentModuleFindings(`import 'lodash'\nexport default () => {}\n`).errors.join(), /'lodash'/)
	assert.deepEqual(componentModuleFindings(`import './local.js'\nimport '/plugin-ui/x/y.js'\n`).errors, [])
	const { advisories } = componentModuleFindings(`document.createElement('iframe')\n`)
	assert.match(advisories.join(), /<iframe>/)
	assert.throws(() => judgeComponentModule('bad', `new SharedWorker('x')`), /component 'bad'/)
})

test('the round trip passes on the reference host', async () => {
	const view = await mountCode(COMPONENT_PROTOCOL_FIXTURE, {})
	try {
		await componentProtocolCase(view)
	} finally {
		await view.unmount()
	}
})

test('a host that drops a push fails the round trip, naming what broke', async () => {
	const view = await mountCode(COMPONENT_PROTOCOL_FIXTURE, {})
	const deaf: ComponentView = Object.assign(Object.create(view), { push: async () => {} })
	try {
		await assert.rejects(componentProtocolCase(deaf), /pushed section must reach the component/)
	} finally {
		await view.unmount()
	}
})

test('the scanner reads code as code: minified, aliased and remote forms fail; words in strings do not', () => {
	const errs = (code: string) => componentModuleFindings(code).errors.join('\n')
	// Minified imports and re-exports, dynamic and required ones.
	assert.match(errs('import{a}from"lodash";export default a'), /'lodash'/)
	assert.match(errs('import*as l from"lodash"'), /'lodash'/)
	assert.match(errs('export{x}from"lodash"'), /'lodash'/)
	assert.match(errs('import(`lodash`)'), /'lodash'/)
	assert.match(errs('require("lodash")'), /'lodash'/)
	// What the worker cannot load, however it is spelled.
	assert.match(errs('import fs from "node:fs"'), /'node:fs'/)
	assert.match(errs('import x from "https://cdn.example/x.js"'), /https:/)
	assert.match(errs('import x from "//cdn.example/x.js"'), /cdn\.example/)
	// A worker of its own, however it is reached.
	assert.match(errs('const W = Worker; new W("x")'), /worker of its own/)
	assert.match(errs('new globalThis.Worker("x")'), /worker of its own/)
	assert.match(errs('self.importScripts("x.js")'), /worker of its own/)
	// The renderer, bundled in: esbuild's path marker, or its classes.
	assert.match(errs('// node_modules/@remote-dom/core/build/esm/x.mjs\nvar a = 1'), /renderer/)
	assert.match(errs('class RemoteRootElement {}'), /renderer/)
	// Not code: strings, templates, comments, regular expressions, properties.
	assert.equal(errs(`const s = "new Worker( is bad; import 'lodash'"`), '')
	assert.equal(errs('const t = `require("lodash")`'), '')
	assert.equal(errs('/* new Worker("x") */ // import "lodash"'), '')
	assert.equal(errs('const r = /import "lodash"/g'), '')
	assert.equal(errs('const u = import.meta.url; x.import("y")'), '')
	// A computed import is not guessed at.
	assert.equal(errs('const n = "a"; import(n)'), '')
	// Svelte's compiled templates are read for element names.
	assert.match(componentModuleFindings('from_html(`<div><iframe></iframe></div>`)').advisories.join(), /<iframe>/)
	assert.deepEqual(componentModuleFindings('from_html(`<div><p>hi</p></div>`)').advisories, [])
})

test('the harness judges what it builds: a module that would be refused is not mounted', async () => {
	await assert.rejects(mountCode(`export default () => { new Worker('x.js') }\n`, {}), /would be refused.*worker of its own/)
})

test('a host whose click never reaches the component fails the round trip', async () => {
	const view = await mountCode(COMPONENT_PROTOCOL_FIXTURE, {})
	const numb: ComponentView = Object.assign(Object.create(view), { click: async () => {} })
	try {
		await assert.rejects(componentProtocolCase(numb), /click must cross to the component/)
	} finally {
		await view.unmount()
	}
})
