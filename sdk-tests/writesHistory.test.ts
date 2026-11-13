/**
 * 🚧 W_WRITES_HISTORY — scenes first (owner, 2026-11-10): a pipeline that files a history entry
 * directly is warned, never refused; a summarize-request pipeline is exempt; `declaredNodeParams`
 * is the one reader of what a document declares for a node.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineExtension, spec, declaredNodeParams } from '@serene-pub/sdk'
import type { SpecDocument } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { fileLore, rememberNote, historyEntryType, worldLoreEntryType } from '@serene-pub/core-catalog'
import { applyWiring, wiring } from '../core-catalog/src/shared/calls.js'
import { compilePlugin, type CompileResult } from '../cli/src/compiler.js'

const SLUG = 'acme.lab'
const build = (pipelines: unknown[]): CompileResult =>
	compilePlugin({
		sources: [{ path: 'index.ts', text: '' }],
		extension: Object.assign(defineExtension({ slug: SLUG, name: 'Lab', version: '0.1.0' }), { pipelines }) as never,
	})
const warned = (r: CompileResult) => r.findings.filter((f) => f.code === 'W_WRITES_HISTORY')

const noting = (id: string, entryType: unknown, inlet: 'user' | 'summarize' = 'user') => {
	const w = wiring()
	const head = spec(id, { version: '1.0.0', taxonomy: { role: 'maintenance' } })
	const b: any = inlet === 'summarize' ? head.inlet('input', C.summarizeRequest.v1(), { suits: [] }) : head.inlet('input', C.userMessage.v1())
	return rememberNote(b, w, {
		key: 'save',
		name: ($: any) => $.input.text ?? $.input.request,
		content: ($: any) => $.input.text ?? $.input.request,
		entryType: entryType as never,
	})
		.defaults((p: any) => applyWiring(p, w))
		.build()
}

const filing = (id: string, entryType: unknown) => {
	const w = wiring()
	const b: any = spec(id, { version: '1.0.0', taxonomy: { role: 'maintenance' } }).inlet('input', C.userMessage.v1())
	return fileLore(b, w, {
		from: ($: any) => $.input.text,
		member: 'notes',
		listLabel: 'The notes',
		each: 'note',
		noun: 'note',
		max: 3,
		entryType: entryType as never,
		writeLabel: 'File the note',
	})
		.defaults((p: any) => applyWiring(p, w))
		.build()
}

describe('W_WRITES_HISTORY: a pipeline that writes history directly (scenes first, warning only)', () => {
	test("a node's own literal `params` naming history warns once, and ok is unchanged", () => {
		const own = spec(`${SLUG}:spec/own`, { version: '1.0.0', taxonomy: { role: 'maintenance' } })
			.inlet('input', C.userMessage.v1())
			.outlet('save', ($: any) =>
				C.createLoreEntry.v1({ name: $.input.text, content: $.input.text, params: { entryType: 'core:entry/history' } as never }),
			)
			.build()
		const r = build([own])
		const w = warned(r)
		assert.equal(w.length, 1, JSON.stringify(r.findings.map((f) => [f.code, f.message])))
		assert.equal(w[0]!.severity, 'warning')
		assert.match(w[0]!.message, /acme\.lab:spec\/own/)
		assert.match(w[0]!.message, /'save'/)
		assert.match(w[0]!.fix, /note-scene@1/)
		assert.equal(r.ok, !r.findings.some((f) => f.severity === 'error'))
	})

	test('history through a rememberNote default warns; so does fileLore', () => {
		assert.equal(warned(build([noting(`${SLUG}:spec/note`, historyEntryType)])).length, 1)
		assert.equal(warned(build([filing(`${SLUG}:spec/file`, historyEntryType)])).length, 1)
	})

	test('world lore stays silent', () => {
		assert.equal(warned(build([noting(`${SLUG}:spec/world`, worldLoreEntryType)])).length, 0)
		assert.equal(warned(build([filing(`${SLUG}:spec/world-file`, worldLoreEntryType)])).length, 0)
	})

	test('a summarize-request pipeline is exempt', () => {
		assert.equal(warned(build([noting(`${SLUG}:spec/sum`, historyEntryType, 'summarize')])).length, 0)
	})
})

describe('declaredNodeParams', () => {
	const doc = (presets: unknown[]) =>
		({
			nodes: [{ key: 'n', definitionId: 'core:outlet/create-lore-entry', config: { params: { entryType: 'own', keep: 1 } } }],
			presets,
		}) as unknown as Pick<SpecDocument, 'nodes' | 'presets'>
	const row = (def: boolean, entryType: string) => ({
		default: def,
		values: [{ nodeKey: 'n', slot: 'params', value: { entryType } }],
	})

	test('a default preset row overrides the node own param', () => {
		assert.deepEqual(declaredNodeParams(doc([row(true, 'preset')]), 'n'), { entryType: 'preset', keep: 1 })
	})

	test('a non-default preset row does not', () => {
		assert.deepEqual(declaredNodeParams(doc([row(false, 'preset')]), 'n'), { entryType: 'own', keep: 1 })
	})
})
