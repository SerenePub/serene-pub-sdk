/**
 * The plain-TypeScript half of core's Album widget
 * (`@serene-pub/core-catalog/album`, PLAN-core-widgets W2): its declaration,
 * its settings, and the one reading it draws — every picture on the
 * session's lines, newest line first, each with where it came from and who
 * showed it when — and the lightbox request a press makes.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { MessagePartV1, MessageV1 } from '@serene-pub/sdk'
import {
	ALBUM_DEFAULTS,
	ALBUM_EMPTY,
	albumItems,
	albumOpenLabel,
	albumSrc,
	albumViewImageParams,
	readAlbumSettings,
} from '../core-catalog/src/shared/ui/album/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'

let nextPart = 1
const image = (
	messageId: number,
	assetId: number,
	over: Partial<MessagePartV1> & { data?: Record<string, unknown> } = {},
): MessagePartV1 => ({
	id: nextPart++,
	messageId,
	step: 0,
	revision: 0,
	ordinal: 0,
	type: 'core:image',
	content: null,
	...over,
	data: { assetId, ...(over.data ?? {}) },
})

const row = (
	id: number,
	role: string,
	parts: MessagePartV1[],
	over: Partial<MessageV1> = {},
): MessageV1 => ({
	id,
	role,
	content: '',
	speakerLabel: role === 'user' ? 'Mara' : 'Wren',
	createdAt: '2026-10-11T21:41:00Z',
	parts,
	...over,
})

/** The log, oldest first, as the host posts it. */
const LOG: MessageV1[] = [
	row(1, 'user', [image(1, 11, { data: { alt: 'the map' } })]),
	row(2, 'assistant', [
		image(2, 21, { data: { filename: 'forest.png' } }),
		image(2, 22, { ordinal: 1 }),
	]),
	row(3, 'user', [], { content: 'No pictures here.' }),
	row(4, 'assistant', [image(4, 41)], { channel: 'sanctum' }),
	row(5, 'user', [image(5, 51)], { channel: 'sanctum:2' }),
]

const all = (over: Partial<typeof ALBUM_DEFAULTS> = {}) =>
	albumItems(LOG, { ...ALBUM_DEFAULTS, ...over })

describe('the declaration', () => {
	test('album: every genre, no scopes, no cap, the three sections it reads, four settings', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'album')!
		assert.ok(decl)
		assert.equal(coreWidgets.album, decl)
		assert.equal(decl.title, 'Album')
		assert.equal(
			decl.icon,
			'BookImage',
			"not `Images`: that is the Media collection's (§22 I1)",
		)
		assert.equal(decl.maxInstances, undefined)
		assert.equal(decl.genres, undefined)
		assert.equal(decl.scopes, undefined)
		assert.deepEqual(decl.reads, ['messages', 'settings', 'locale'])
		assert.deepEqual(decl.layout, { span: { ideal: 1 }, minInline: 200 })
		assert.deepEqual(Object.keys(decl.settings ?? {}), [
			'source',
			'tile',
			'arrangement',
			'channel',
		])
		const s = decl.settings as Record<
			string,
			{ of?: string[]; default?: unknown; group?: string }
		>
		assert.deepEqual(s.source!.of, ['all', 'attached', 'generated'])
		assert.equal(s.source!.default, 'all')
		assert.deepEqual(s.tile!.of, ['small', 'medium', 'large'])
		assert.equal(s.tile!.default, 'medium')
		assert.deepEqual(s.arrangement!.of, ['grid', 'latest'])
		assert.equal(s.arrangement!.default, 'grid')
		assert.equal(s.channel!.group, 'behaviour')
		assert.ok(
			CORE_COMPONENTS.some(
				(c) => c.slug === 'album' && c.entry === 'components/shared/album/album.ts',
			),
		)
	})

	test('the name is Album, never gallery', () => {
		const decl = coreWidgets.album
		assert.doesNotMatch(JSON.stringify(decl), /gallery/i)
	})
})

describe('readAlbumSettings', () => {
	test('the declared defaults wherever an instance has none, and for a value it does not offer', () => {
		assert.deepEqual(readAlbumSettings(undefined), ALBUM_DEFAULTS)
		assert.deepEqual(
			readAlbumSettings({
				source: 'sprites',
				tile: 'huge',
				arrangement: 'stage',
				channel: 7,
			}),
			ALBUM_DEFAULTS,
		)
		assert.deepEqual(
			readAlbumSettings({
				source: 'generated',
				tile: 'large',
				arrangement: 'latest',
				channel: '  sanctum ',
			}),
			{
				source: 'generated',
				tile: 'large',
				arrangement: 'latest',
				channel: 'sanctum',
			},
		)
	})
})

describe('albumItems', () => {
	test('newest line first; a line keeps its own pictures in the strip order', () => {
		assert.deepEqual(
			all().map((i) => i.assetId),
			[51, 41, 21, 22, 11],
		)
		const [, , forest, untitled, map] = all()
		assert.equal(forest!.label, 'forest.png')
		assert.equal(untitled!.label, 'Image')
		assert.equal(map!.label, 'the map', 'the alt first')
		assert.equal(map!.messageId, 1)
	})

	test("origin is the row's: a person's line attached, any other generated", () => {
		assert.deepEqual(
			all().map((i) => i.origin),
			['attached', 'generated', 'generated', 'generated', 'attached'],
		)
	})

	test('source keeps the attached or the generated alone', () => {
		assert.deepEqual(
			all({ source: 'attached' }).map((i) => i.assetId),
			[51, 11],
		)
		assert.deepEqual(
			all({ source: 'generated' }).map((i) => i.assetId),
			[41, 21, 22],
		)
	})

	test("channel claims one channel's every lane, as a Messages copy's does; empty is every channel", () => {
		assert.deepEqual(
			all({ channel: 'sanctum' }).map((i) => i.assetId),
			[51, 41],
		)
		assert.deepEqual(
			all({ channel: 'sanctum:2' }).map((i) => i.assetId),
			[51, 41],
			'a slug, every lane of it',
		)
		assert.deepEqual(
			all({ channel: 'main' }).map((i) => i.assetId),
			[21, 22, 11],
			'an unset row channel is main',
		)
		assert.deepEqual(all({ channel: 'phone' }), [])
		assert.equal(all().length, 5)
	})

	test("caption is the line's speaker and clock; either alone when the other is missing", () => {
		const [first] = albumItems(
			[row(9, 'assistant', [image(9, 91)], { speakerLabel: null })],
			ALBUM_DEFAULTS,
		)
		assert.equal(first!.speaker, '')
		assert.ok(first!.time)
		assert.equal(first!.caption, first!.time)
		const [named] = albumItems(
			[row(9, 'assistant', [image(9, 92)], { createdAt: undefined })],
			ALBUM_DEFAULTS,
		)
		assert.equal(named!.caption, 'Wren')
		const [both] = all()
		assert.equal(both!.caption, `Mara · ${both!.time}`)
		// A day-only `createdAt` reads `updatedAt`, as the line's clock does.
		const [dayOnly] = albumItems(
			[row(9, 'user', [image(9, 93)], { createdAt: '2026-10-11', updatedAt: 'not a time' })],
			ALBUM_DEFAULTS,
		)
		assert.equal(dayOnly!.time, '')
	})

	test('the shown revision only; no asset, a file part, a hidden row — none drawn', () => {
		const items = albumItems(
			[
				row(
					1,
					'assistant',
					[
						image(1, 1, { step: 0, revision: 0 }),
						image(1, 2, { step: 0, revision: 1 }),
						image(1, 3, { step: 1, revision: 0 }),
					],
					{ activeRevisions: { '0': 1 } },
				),
				row(2, 'user', [{ ...image(2, 4), data: { alt: 'no file' } }]),
				row(3, 'user', [{ ...image(3, 5), type: 'core:file' }]),
				row(4, 'user', [image(4, 6)], { isHidden: true }),
			],
			ALBUM_DEFAULTS,
		)
		assert.deepEqual(
			items.map((i) => i.assetId),
			[2, 3],
		)
	})

	test('nothing in, nothing out', () => {
		assert.deepEqual(albumItems(undefined, ALBUM_DEFAULTS), [])
		assert.deepEqual(albumItems([], ALBUM_DEFAULTS), [])
		assert.equal(ALBUM_EMPTY.all, 'Nothing has been attached or generated in this session yet.')
	})
})

describe('the lightbox request', () => {
	test('the whole album as its pages, in the order drawn, src at index', () => {
		const items = all()
		const p = albumViewImageParams(items, 2)
		assert.equal(p.src, '/media/21')
		assert.deepEqual(p.gallery.srcs, [
			'/media/51',
			'/media/41',
			'/media/21',
			'/media/22',
			'/media/11',
		])
		assert.equal(p.gallery.index, 2)
		assert.equal(p.gallery.srcs[p.gallery.index], p.src)
		assert.deepEqual(p.gallery.captions, ['Image', 'Image', 'forest.png', 'Image', 'the map'])
		assert.equal(albumSrc(5, 'thumb'), '/media/5?v=thumb')
	})

	test("a tile's name says what it opens, where it came from, who and when, and where it sits", () => {
		const items = all()
		const map = items[4]!
		assert.equal(
			albumOpenLabel(map, 4, 5),
			`Open attached image the map, ${map.caption}, 5 of 5`,
		)
		assert.equal(
			albumOpenLabel({ ...items[1]!, caption: '' }, 0, 1),
			'Open generated image Image',
		)
	})
})
