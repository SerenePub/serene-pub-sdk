/**
 * The widgets guide lists every stylable part core's widgets draw.
 *
 * A widget style targets elements by part (`[data-widget-part~="stats.card"]`),
 * and the only declaration of a part is the `data-widget-part` attribute in a
 * core-catalog component. The guide's list is generated from those components
 * (`npm run gen:widget-parts`); this fails when a component gains, renames or
 * drops a part and the guide was not regenerated, so a style author never
 * reads a part that is not there or misses one that is.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	corePartTokens,
	renderWidgetParts,
	withWidgetParts,
	WIDGET_PARTS_GUIDE,
} from '../scripts/widgetParts.js'

const guide = readFileSync(new URL(`../${WIDGET_PARTS_GUIDE}`, import.meta.url), 'utf8')

describe('widget parts in the widgets guide', () => {
	test("reads every core widget's parts, and the generic ones", () => {
		const { owned, generic } = corePartTokens()
		for (const owner of [
			'messages',
			'stats',
			'world-state',
			'scene-portraits',
			'lore-entries',
			'stat-slot',
		])
			assert.ok(owned.get(owner)?.size, `no parts read for '${owner}'`)
		assert.ok(owned.get('messages')!.has('root'))
		assert.ok(generic.has('card'))
	})

	test('the guide carries the list the components declare (run `npm run gen:widget-parts`)', () => {
		assert.equal(guide, withWidgetParts(guide, renderWidgetParts()))
	})
})
