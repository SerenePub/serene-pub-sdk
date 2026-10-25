/**
 * 🚧 The lore builders (pass 8 §2, pass 6): `fileLore` and `rememberNote` expand to the explicit
 * `create-lore-entry@1` outlet, name the entry type in the document's defaults, and wire `sources`
 * only when asked; `summarizeScene` refuses a channel whose lore role is not what a summary reads.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { compile, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	fileLore,
	rememberNote,
	summarizeScene,
	lairGenre,
	worldLoreEntryType,
	historyEntryType,
} from '@serene-pub/core-catalog'
// The wiring collector is the catalogue's internal; the builders take it as an argument.
import { applyWiring, wiring } from '../core-catalog/src/shared/calls.js'

const base = (id: string) =>
	spec(id, { version: '1.0.0', taxonomy: { role: 'maintenance' } })
		.inlet('input', C.summarizeRequest.v1(), { suits: [] })
		.query('transcript', ($) => C.summarizeSource.v1({ scope: $.input.scope, request: $.input.request }))

const fileLoreSpec = (withSources: boolean) => {
	const w = wiring()
	return fileLore(base('test.lore:spec/file') as any, w, {
		from: ($: any) => $.input.request,
		member: 'notes',
		listLabel: 'The notes',
		each: 'note',
		noun: 'note',
		max: 3,
		entryType: worldLoreEntryType,
		writeLabel: 'File the note',
		...(withSources ? { sources: ($: any) => $.transcript.messages } : {}),
	})
		.defaults((p: any) => applyWiring(p, w))
		.build()
}

const noted = (withSources: boolean) => {
	const w = wiring()
	return rememberNote(base('test.lore:spec/note') as any, w, {
		key: 'save',
		name: ($: any) => $.input.request,
		content: ($: any) => $.input.request,
		entryType: historyEntryType,
		...(withSources ? { sources: ($: any) => $.transcript.messages } : {}),
	})
		.defaults((p: any) => applyWiring(p, w))
		.build()
}

const keys = (doc: any) => doc.nodes.map((n: any) => n.key)
const wired = (doc: any, to: string, toPort: string) => doc.edges.some((e: any) => e.to === to && e.toPort === toPort)
const defaultsOf = (doc: any, nodeKey: string) =>
	(doc.presets?.[0]?.values ?? []).filter((v: any) => v.nodeKey === nodeKey && v.slot === 'params').map((v: any) => v.value)

describe('fileLore', () => {
	test('builds the list, the each and the outlet under the keys the call sites use, and names the entry type', () => {
		const doc: any = compile(fileLoreSpec(false))
		const ks = keys(doc)
		for (const k of ['list', 'note.item.name', 'note.item.content', 'note.item.write'])
			assert.ok(ks.includes(k), `${k} in ${ks.join(', ')}`)
		const write = ks.find((k: string) => k.endsWith('write'))!
		assert.deepEqual(defaultsOf(doc, write), [{ entryType: 'core:entry/world-lore' }])
	})

	test('wires sources when given, and does not when absent', () => {
		const withS: any = compile(fileLoreSpec(true))
		const without: any = compile(fileLoreSpec(false))
		const write = (d: any) => keys(d).find((k: string) => k.endsWith('write'))!
		assert.equal(wired(withS, write(withS), 'sources'), true)
		assert.equal(wired(without, write(without), 'sources'), false)
	})
})

describe('rememberNote', () => {
	test('builds the outlet under its key with the entry type in the defaults', () => {
		const doc: any = compile(noted(false))
		assert.ok(keys(doc).includes('save'))
		assert.equal(defaultsOf(doc, 'save').length, 1)
		assert.match(JSON.stringify(defaultsOf(doc, 'save')), /history/)
	})

	test('wires sources when given, and does not when absent', () => {
		assert.equal(wired(compile(noted(true)) as any, 'save', 'sources'), true)
		assert.equal(wired(compile(noted(false)) as any, 'save', 'sources'), false)
	})
})

describe('summarizeScene and channel lore roles', () => {
	const sentence = (slug: string, role: string) =>
		`test.lore:spec/s1: '${slug}' is a '${role}' channel of core:genre/lair — a summary reads its story channel as 'story' and its asides as 'aside' (ChannelDecl.lore).`
	const lairWith = (lore: 'never' | 'aside' | undefined) => ({
		...lairGenre,
		shape: {
			...(lairGenre.shape as any),
			channels: (lairGenre.shape as any).channels.map((c: any) => {
				if (c.slug !== 'sanctum') return c
				const { lore: _drop, ...rest } = c
				return lore ? { ...rest, lore } : rest
			}),
		},
	})

	test('refuses an aside channel whose lore role is never, with the sentence', () => {
		assert.throws(
			() => summarizeScene('test.lore:spec/s1', { version: '1.0.0', genre: lairWith(undefined) as any, channels: { story: 'main', asides: ['sanctum'] } }),
			(e: Error) => e.message === sentence('sanctum', 'never'),
		)
	})

	test('accepts the Lair as shipped: the Sanctum is an aside', () => {
		assert.equal((lairGenre.shape as any).channels.find((c: any) => c.slug === 'sanctum').lore, 'aside')
		assert.doesNotThrow(() =>
			summarizeScene('test.lore:spec/s2', { version: '1.0.0', genre: lairGenre, channels: { story: 'main', asides: ['sanctum'] } }),
		)
	})

	test('refuses a story channel that is not the story', () => {
		assert.throws(
			() => summarizeScene('test.lore:spec/s1', { version: '1.0.0', genre: lairGenre, channels: { story: 'sanctum' } }),
			(e: Error) => e.message === sentence('sanctum', 'aside'),
		)
	})
})
