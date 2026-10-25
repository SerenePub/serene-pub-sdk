/**
 * 🚧 The composer's attachment kinds beyond pictures and documents (O2/O4/O9,
 * 2026-10-21): a sound and a moving picture are told apart by their first
 * bytes, refused or let through by the readers per kind, and a call that
 * cannot hear a sound but has it heard for it says so.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	ATTACHMENT_KINDS_V1,
	preCheckFiles,
	readerCallLines,
	sniffAttachmentKind,
} from '../core-catalog/src/shared/ui/conversation/composerTray.js'
import type { AttachmentReadersV1 } from '../core-catalog/src/shared/ui/conversation/index.js'

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)])
const at4 = (sig: number[], brand: number[]) => bytes(0, 0, 0, 0x20, ...sig, ...brand)

test('audio and video are attachment kinds, after the three that were', () => {
	assert.deepEqual([...ATTACHMENT_KINDS_V1], ['image', 'text', 'pdf', 'audio', 'video'])
})

test('a sound is told by its container, a moving picture by its', () => {
	assert.equal(sniffAttachmentKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45), 'a.wav'), 'audio')
	assert.equal(sniffAttachmentKind(bytes(0x49, 0x44, 0x33), 'a.mp3'), 'audio')
	assert.equal(sniffAttachmentKind(bytes(0xff, 0xfb, 0x90), 'a.mp3'), 'audio')
	assert.equal(sniffAttachmentKind(bytes(0x4f, 0x67, 0x67, 0x53), 'a.ogg'), 'audio')
	assert.equal(sniffAttachmentKind(bytes(0x4f, 0x67, 0x67, 0x53), 'a.ogv'), 'video')
	assert.equal(sniffAttachmentKind(bytes(0x66, 0x4c, 0x61, 0x43), 'a.flac'), 'audio')
	assert.equal(sniffAttachmentKind(at4([0x66, 0x74, 0x79, 0x70], [0x4d, 0x34, 0x41, 0x20]), 'a.m4a'), 'audio')
	assert.equal(sniffAttachmentKind(at4([0x66, 0x74, 0x79, 0x70], [0x69, 0x73, 0x6f, 0x6d]), 'a.mp4'), 'video')
	assert.equal(sniffAttachmentKind(bytes(0x1a, 0x45, 0xdf, 0xa3), 'a.webm'), 'video')
	assert.equal(sniffAttachmentKind(bytes(0x1a, 0x45, 0xdf, 0xa3), 'a.weba'), 'audio')
	// A JPEG still opens 0xFF 0xD8 — a picture, never a frame sync.
	assert.equal(sniffAttachmentKind(bytes(0xff, 0xd8, 0xff), 'a.jpg'), 'image')
})

const readers = (over: Partial<AttachmentReadersV1> = {}): AttachmentReadersV1 => ({
	kinds: { image: { allowed: true }, text: { allowed: true }, audio: { allowed: true } },
	calls: [
		{ key: 'respond', label: 'Reply', reads: ['image', 'text'], placeholderFor: ['audio'], transcribes: ['audio'] },
	],
	accept: '',
	filesPerMessage: 10,
	bytesPerKind: { image: 20, text: 20, audio: 25 },
	...over,
})

test('a call that has audio heard for it says so, apart from what it is only named', () => {
	assert.deepEqual(readerCallLines(readers()), ['Reply: images, text files (audio files reach it as what they say)'])
	assert.deepEqual(
		readerCallLines(
			readers({ calls: [{ key: 'respond', label: 'Reply', reads: ['text'], placeholderFor: ['image', 'audio'] }] }),
		),
		['Reply: text files (images and audio files appear to it as a name)'],
	)
})

test('the pre-check reads the kinds per kind: an allowed sound goes up, a video no row answers is refused', () => {
	const { accept, refusals } = preCheckFiles(
		[
			{ name: 'note.mp3', size: 10, kind: 'audio' },
			{ name: 'clip.mp4', size: 10, kind: 'video' },
			{ name: 'long.wav', size: 30, kind: 'audio' },
		],
		[],
		readers(),
	)
	assert.deepEqual(accept, [0])
	assert.deepEqual(
		refusals.map((r) => r.filename),
		['clip.mp4', 'long.wav'],
	)
	assert.match(refusals[1]!.reason, /An audio file can be at most/)
})
