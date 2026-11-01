/**
 * A genre's `shape.fullscreen` (M0, lane U2; SHAPES L1): only
 * 'propose', and only beside a session view.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { genre } from '@serene-pub/sdk'

describe('a genre’s shape.fullscreen', () => {
	test('propose beside a view passes', () => {
		genre('test.fullscreen:genre/good', {
			name: { en: 'X' },
			family: 'test',
			shape: { view: 'x', fullscreen: 'propose' },
		} as any)
	})
	test('without a view it is refused with its sentence', () => {
		assert.throws(
			() => genre('test.fullscreen:genre/noview', { name: { en: 'X' }, family: 'test', shape: { fullscreen: 'propose' } } as any),
			/test\.fullscreen:genre\/noview\.shape\.fullscreen proposes full screen without a session view\. Declare shape\.view/,
		)
	})
	test('lock is refused: a genre proposes, never locks', () => {
		assert.throws(
			() => genre('test.fullscreen:genre/lock', { name: { en: 'X' }, family: 'test', shape: { view: 'x', fullscreen: 'lock' } } as any),
			/test\.fullscreen:genre\/lock\.shape\.fullscreen: only 'propose'/,
		)
	})
})

// 🚧 M2c (2026-10-31): `shape.applet: true` lists the genre's frame under Apps — only beside a view.
describe('a genre’s shape.applet', () => {
	test('true beside a view passes', () => {
		genre('test.applet:genre/good', {
			name: { en: 'X' },
			family: 'test',
			shape: { view: 'x', fullscreen: 'propose', applet: true },
		} as any)
	})
	test('without a view it is refused with its sentence', () => {
		assert.throws(
			() => genre('test.applet:genre/noview', { name: { en: 'X' }, family: 'test', shape: { applet: true } } as any),
			/test\.applet:genre\/noview\.shape\.applet without a session view/,
		)
	})
	test('any other value is refused', () => {
		assert.throws(
			() => genre('test.applet:genre/other', { name: { en: 'X' }, family: 'test', shape: { view: 'x', applet: 'yes' } } as any),
			/test\.applet:genre\/other\.shape\.applet: only true/,
		)
	})
})
