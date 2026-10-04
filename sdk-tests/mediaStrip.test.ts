/**
 * The media strip's reading of a message (composer attachments §3.4): its
 * files in step-then-ordinal order, the active revision only, alt text from
 * the part's alt then its name, and the lightbox request it makes.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostAttributeValueFinding, hostEventAllowed } from '@serene-pub/sdk'
import {
	fileIcon,
	formatBytes,
	mediaStripItems,
	viewImageParams,
} from '../core-catalog/components/sessions/messages/mediaStrip.js'

const part = (id: number, step: number, revision: number, ordinal: number, type: string, data: Record<string, unknown> | null) => ({
	id,
	messageId: 1,
	step,
	revision,
	ordinal,
	type,
	content: null,
	data,
})

test('the strip reads image and file parts: steps ascending, the active revision, ordinals in order', () => {
	const items = mediaStripItems(
		[
			part(5, 1, 0, 10, 'core:image', { assetId: 50, filename: 'later.png' }),
			part(2, 0, 0, 11, 'core:file', { assetId: 20, name: 'notes.txt', mime: 'text/plain', bytes: 900 }),
			part(1, 0, 0, 10, 'core:image', { assetId: 10, alt: 'A map', filename: 'map.png', width: 800, height: 600 }),
			part(3, 0, 1, 12, 'core:image', { assetId: 30 }), // another swipe of step 0
			part(4, 0, 0, 1, 'core:markdown', null),
			part(6, 0, 0, 13, 'core:image', { assetId: 'x' }), // no usable asset
		] as never,
		{ '0': 0, '1': 0 },
	)
	assert.deepEqual(
		items.map((i) => [i.partId, i.kind, i.assetId, i.label]),
		[
			[1, 'image', 10, 'A map'],
			[2, 'file', 20, 'notes.txt'],
			[5, 'image', 50, 'later.png'],
		],
	)
	assert.equal(items[0]!.width, 800)
	assert.equal(items[1]!.bytes, 900)
	assert.deepEqual(mediaStripItems(undefined, undefined), [])
})

test('an image with neither alt nor name is still named', () => {
	const [only] = mediaStripItems([part(1, 0, 0, 10, 'core:image', { assetId: 1 })] as never, null)
	assert.equal(only!.label, 'Image')
})

test("opening an image asks for the message's images as the lightbox gallery", () => {
	const items = mediaStripItems(
		[
			part(1, 0, 0, 10, 'core:image', { assetId: 1, filename: 'a.png' }),
			part(2, 0, 0, 11, 'core:image', { assetId: 2, filename: 'b.png' }),
		] as never,
		null,
	)
	assert.deepEqual(viewImageParams(items, 1), {
		src: '/media/2',
		gallery: { srcs: ['/media/1', '/media/2'], index: 1, captions: ['a.png', 'b.png'] },
	})
})

test('chip helpers: sizes and kind icons', () => {
	assert.equal(formatBytes(812), '812 B')
	assert.equal(formatBytes(14 * 1024), '14 KB')
	assert.equal(formatBytes(3.2 * 1024 * 1024), '3.2 MB')
	assert.equal(fileIcon('text/markdown'), 'file-text')
	assert.equal(fileIcon('application/pdf'), 'file-text')
	assert.equal(fileIcon('application/zip'), 'file')
	assert.equal(fileIcon(null), 'file')
})

test('vocabulary 1.2: an img loads lazily, decodes async, and raises error', () => {
	assert.equal(hostAttributeValueFinding('img', 'loading', 'lazy'), undefined)
	assert.equal(hostAttributeValueFinding('img', 'decoding', 'async'), undefined)
	assert.match(hostAttributeValueFinding('img', 'loading', 'soon') ?? '', /lazy or eager/)
	assert.match(hostAttributeValueFinding('img', 'decoding', 'later') ?? '', /async, sync or auto/)
	assert.equal(hostEventAllowed('img', 'error'), true)
	assert.equal(hostEventAllowed('img', 'load'), false)
})
