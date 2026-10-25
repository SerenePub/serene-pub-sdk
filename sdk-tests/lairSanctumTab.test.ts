/**
 * 🚧 The Lair's Sanctum, a tab beside the story (lair fix 2, owner
 * 2026-10-22; was its own panel, lair re-plan S1): no copy of the `messages`
 * widget claims the Sanctum, so the story's copy shows both channels and
 * draws a tab each (`channelTabsOf`) — *Story* and *Sanctum*, the genre's
 * labels — with the single-line composer on the Sanctum's tab
 * (`otherTabsComposer`). A tab not shown carries a dot when somebody else's
 * line lands there (`channelTabDots`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channelDecls } from '@serene-pub/sdk'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'
import { lairGenre } from '../core-catalog/src/registry/genres.js'
import {
	channelTabDots,
	channelTabsOf,
	NO_LANE_CHANNEL,
	newestNewsOn,
} from '../core-catalog/src/shared/ui/conversation/index.js'

test("the Lair's live layout has no Sanctum panel: the story's copy shows the Sanctum as a tab", () => {
	const layout = lairGenre.layouts![0]!.preset as any
	const right = layout.panels.right as Array<{ tabs: string[]; pinned?: false }>
	assert.deepEqual(
		right.map((p) => p.tabs),
		[['places'], ['annex#castellan']],
	)
	assert.ok(right.every((p) => p.pinned === undefined), 'the right column opens whole')
	assert.deepEqual(layout.panels.middle.primary.tabs, ['messages'])
	// No copy claims a channel, so the story's copy is every channel's.
	for (const [id, values] of Object.entries(layout.widgetSettings ?? {}))
		assert.equal((values as { channel?: unknown }).channel, undefined, `${id} claims no channel`)
	assert.deepEqual(layout.widgetSettings.messages, { otherTabsComposer: 'minimal' })
})

test('the tabs are named by the genre: Story and Sanctum, Pick and retake off the Sanctum', () => {
	const decls = channelDecls(lairGenre.shape)
	assert.deepEqual(
		decls.map((d) => [d.slug, d.label]),
		[
			['main', { en: 'Story' }],
			['sanctum', { en: 'Sanctum' }],
		],
	)
	const sanctum = decls[1]!
	assert.equal(sanctum.turnControls?.pick, false)
	assert.equal(sanctum.turnControls?.retake, false)
	assert.notEqual(sanctum.turnControls?.narrate, false)
	assert.notEqual(sanctum.turnControls?.advance, false)
})

test('the widget declares the other tabs’ composer, Same by default', () => {
	const messages = CORE_WIDGETS.find((w) => w.id === 'messages')
	const setting = messages?.settings?.otherTabsComposer as { type?: string; of?: string[]; default?: string } | undefined
	assert.equal(setting?.type, 'enum')
	assert.deepEqual(setting?.of, ['same', 'classic', 'minimal', 'writer', 'quill'])
	assert.equal(setting?.default, 'same')
})

test('channelTabsOf: a tab a channel, only when there are two or more', () => {
	assert.deepEqual(channelTabsOf(null), [])
	assert.deepEqual(channelTabsOf([]), [])
	assert.deepEqual(channelTabsOf(['main']), [], 'one channel needs no tab')
	assert.deepEqual(channelTabsOf(['main', 'sanctum']), ['main', 'sanctum'])
	// A listed lane in its written form; the no-lane marker is never a tab.
	assert.deepEqual(channelTabsOf(['main', 'parley:1', 'parley:2']), ['main', 'parley', 'parley:2'])
	assert.deepEqual(channelTabsOf([NO_LANE_CHANNEL, 'main']), [])
})

test('newestNewsOn and channelTabDots: somebody else’s line on a hidden tab is news, never the viewer’s own', () => {
	const rows = [
		{ id: 1, channel: 'sanctum', role: 'assistant', userId: 7 }, // the greeting, written by the owner's run
		{ id: 2, channel: 'main', role: 'user', userId: 7 },
		{ id: 3, channel: 'sanctum', role: 'user', userId: 7 }, // the GM's own Sanctum line
	]
	assert.equal(newestNewsOn(rows, 'sanctum', 7), 1)
	assert.equal(newestNewsOn(rows, 'main', 7), 0)
	// First look: history is read.
	const seen = new Map([
		['main', 0],
		['sanctum', 1],
	])
	assert.deepEqual([...channelTabDots(['main', 'sanctum'], 'main', rows, 7, seen)], [])
	// A Castellan line lands on the Sanctum while the story is shown: a dot.
	const landed = [...rows, { id: 4, channel: 'sanctum', role: 'assistant', userId: 7 }]
	assert.deepEqual([...channelTabDots(['main', 'sanctum'], 'main', landed, 7, seen)], ['sanctum'])
	// Still being written, or hidden: not yet.
	const writing = [...rows, { id: 4, channel: 'sanctum', role: 'assistant', userId: 7, isGenerating: true }]
	assert.deepEqual([...channelTabDots(['main', 'sanctum'], 'main', writing, 7, seen)], [])
	// The tab shown never carries one, and a tab never seen has no mark yet.
	assert.deepEqual([...channelTabDots(['main', 'sanctum'], 'sanctum', landed, 7, seen)], [])
	assert.deepEqual([...channelTabDots(['main', 'sanctum'], 'main', landed, 7, new Map())], [])
})
