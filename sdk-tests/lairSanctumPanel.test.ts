/**
 * The Lair's Sanctum panel (lair re-plan S1), as the genre ships it: a second
 * copy of the `messages` widget in the live layout's right column, placed
 * under the widget instance id `messages#sanctum` and pinned to the Sanctum by
 * its `channel` setting — a channel the genre declares, with a label.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channelDecls } from '@serene-pub/sdk'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'
import { lairGenre } from '../core-catalog/src/registry/genres.js'

const SANCTUM = 'messages#sanctum'

test("the Lair's live layout places a Sanctum copy of the conversation in its right column", () => {
	const layout = lairGenre.layouts![0]!.preset as any
	assert.deepEqual(layout.zoneLayout.zones.right.widgets, ['world-state', SANCTUM])
	const right = layout.arrangedGrid.right.items as Array<{ id: string; y: number; h: number }>
	assert.deepEqual(
		right.map((i) => i.id),
		['world-state', SANCTUM],
	)
	// The two share the column's twelve rows, the talk taking the larger share.
	assert.equal(right.reduce((n, i) => n + i.h, 0), layout.arrangedGrid.right.rows)
	assert.ok(right[1]!.h > right[0]!.h)
	// The story stays in the middle.
	assert.deepEqual(
		layout.widgetGrid.widgets.map((w: { id: string }) => w.id),
		['messages'],
	)
})

test('the copy is a copy of a widget core has, claiming a channel the Lair declares by label', () => {
	const layout = lairGenre.layouts![0]!.preset as any
	const [widget] = SANCTUM.split('#')
	const messages = CORE_WIDGETS.find((w) => w.id === widget)
	assert.ok(messages, 'the copy names a core widget')
	assert.equal(messages!.settings?.channel?.type, 'string', 'the widget declares its channel setting')
	const pinned = layout.widgetSettings[SANCTUM]
	assert.deepEqual(pinned, { channel: 'sanctum', composer: 'minimal' })
	const decl = channelDecls(lairGenre.shape).find((c) => c.slug === pinned.channel)
	assert.ok(decl, 'the Lair declares the channel the copy claims')
	assert.deepEqual(decl!.label, { en: 'Sanctum' })
	// Pick and retake are off there; Continue and Narrate are not.
	assert.equal(decl!.turnControls?.pick, false)
	assert.equal(decl!.turnControls?.retake, false)
	assert.notEqual(decl!.turnControls?.narrate, false)
	assert.notEqual(decl!.turnControls?.advance, false)
})
