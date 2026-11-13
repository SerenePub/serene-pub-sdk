/**
 * The shipped session layouts, panels v2 (★5, R5, D15; 2026-11-05): each
 * validates, is version 2, and puts Messages, Turn line and Composer in the
 * middle; the three conversation widgets declare their panel defaults.
 *
 * Read from `../core-catalog/src`, not `@serene-pub/core-catalog` (the built
 * package): the literals under test are this tree's, and a test file cannot
 * load both — the registries refuse a genre declared twice.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { validateSessionLayout, type PanelLayoutV2, type SessionLayoutV1 } from '@serene-pub/sdk'
import * as layoutsSrc from '../core-catalog/src/registry/layouts.js'
import { guideGenre, storyGenre } from '../core-catalog/src/registry/genres.js'
import { CORE_WIDGETS } from '../core-catalog/src/registry/widgets.js'

/* ── the shipped layouts as panels v2 (★5, R5, D15; 2026-11-05) ───────────── */

describe('the shipped layouts are panels v2: Messages, Turn line, Composer', () => {
	const shipped: Array<[string, SessionLayoutV1]> = [
		['GUIDE_LAYOUT', layoutsSrc.GUIDE_LAYOUT],
		['STORY_LAYOUT', layoutsSrc.STORY_LAYOUT],
		['STORY_WORLD_LAYOUT', layoutsSrc.STORY_WORLD_LAYOUT],
		['LAIR_LAYOUT', layoutsSrc.LAIR_LAYOUT],
		['LAIR_PARTY_LAYOUT', layoutsSrc.LAIR_PARTY_LAYOUT],
		['DUNGEON_CRAWLER_LAYOUT', layoutsSrc.DUNGEON_CRAWLER_LAYOUT],
	]
	// What a Messages copy carried before the Composer and Turn line were widgets of their own (R8).
	const MOVED = ['showComposer', 'composerPosition', 'showMessages', 'otherTabsComposer', 'nextUp', 'showActions']

	for (const [name, preset] of shipped)
		test(`${name}: validates, version 2, a non-empty middle, each Messages middle panel followed by a turn line and a composer`, () => {
			const verdict = validateSessionLayout(preset, { widgets: CORE_WIDGETS, unknownWidgets: 'warn' })
			assert.deepEqual(verdict.errors, [])
			const panels = preset.panels as PanelLayoutV2
			assert.equal(panels.version, 2)
			assert.ok(panels.middle.length > 0, 'the middle is never empty')
			const isMessages = (id: string) => id === 'messages' || id.startsWith('messages#')
			const at = panels.middle.findIndex((p) => p.tabs.some(isMessages))
			assert.ok(at >= 0, 'the middle holds Messages')
			assert.deepEqual(panels.middle[at + 1]?.tabs, ['turn-line'])
			assert.deepEqual(panels.middle[at + 2]?.tabs, ['composer'])
			// No pin, no old middle, no look keys: the defaults apply.
			for (const p of [...panels.left, ...panels.middle, ...panels.right]) assert.equal('pinned' in p, false)
			assert.equal(panels.backing, undefined)
			assert.equal(panels.opacity, undefined)
			assert.equal(panels.gap, undefined)
			// Keys run p1…pn in order middle, left, right.
			assert.deepEqual(
				[...panels.middle, ...panels.left, ...panels.right].map((p) => p.key),
				[...panels.middle, ...panels.left, ...panels.right].map((_, i) => `p${i + 1}`),
			)
			for (const [id, values] of Object.entries(preset.widgetSettings ?? {}))
				if (id === 'messages' || id.startsWith('messages#'))
					for (const key of MOVED) assert.equal(key in (values as object), false, `${id} carries no ${key}`)
		})

	test('the Guide ships its own layout: Messages, Turn line and Composer, nothing else', () => {
		assert.deepEqual(
			guideGenre.layouts?.map((l) => [l.slug, l.preset]),
			[['default', layoutsSrc.GUIDE_LAYOUT]],
		)
		const panels = layoutsSrc.GUIDE_LAYOUT.panels as PanelLayoutV2
		assert.deepEqual(panels.middle.map((p) => p.tabs), [['messages'], ['turn-line'], ['composer']])
		assert.deepEqual([panels.left, panels.right], [[], []])
		assert.equal(layoutsSrc.GUIDE_LAYOUT.widgetSettings, undefined)
	})

	test('messages, composer, turn-line and dialogue-box declare their panel defaults, and no other core widget does', () => {
		const panelOf = (id: string) => CORE_WIDGETS.find((w) => w.id === id)?.panel
		assert.deepEqual(panelOf('messages'), { height: 'fill', priority: 'low' })
		assert.deepEqual(panelOf('composer'), { height: 'fit', priority: 'high' })
		assert.deepEqual(panelOf('turn-line'), { height: 'fit', priority: 'normal' })
		assert.deepEqual(panelOf('dialogue-box'), { height: 'fit', priority: 'normal' })
		assert.deepEqual(
			CORE_WIDGETS.filter((w) => w.panel !== undefined).map((w) => w.id).sort(),
			['composer', 'dialogue-box', 'messages', 'turn-line'],
		)
	})

	// 2026-11-11: PLAN-visual-novel-layout §1.6 — Story's Visual novel; not in the
	// `shipped` loop, whose look-key assertions it would fail.
	test('STORY_VISUAL_NOVEL_LAYOUT: the Dialogue box over the scene, glass panels and a backdrop', () => {
		const layout = layoutsSrc.STORY_VISUAL_NOVEL_LAYOUT
		const verdict = validateSessionLayout(layout, { widgets: CORE_WIDGETS, unknownWidgets: 'warn' })
		assert.deepEqual(verdict.errors, [])
		assert.deepEqual(verdict.warnings, [])
		const panels = layout.panels as PanelLayoutV2 & Record<string, unknown>
		assert.equal(panels.version, 2)
		assert.deepEqual(
			panels.middle.map((p) => p.tabs),
			[['scene-portraits'], ['dialogue-box', 'messages', 'stats#characters'], ['turn-line'], ['composer']],
		)
		assert.deepEqual(panels.middle.map((p) => p.key), ['p1', 'p2', 'p3', 'p4'])
		assert.deepEqual(panels.middle[1]!.height, { share: 4 })
		assert.deepEqual([panels.left, panels.right], [[], []])
		assert.equal(panels.backing, 'glass')
		assert.equal(panels.behind, 'backdrop')
		for (const k of ['opacity', 'gap', 'behindDim']) assert.equal(k in panels, false, k)
		assert.deepEqual(layout.widgetSettings, {
			'scene-portraits': { who: 'recent', recentTurns: 2, face: 'sprite', arrangement: 'stage', speakerFocus: true },
			messages: { title: 'Log' },
			'stats#characters': { owners: 'cast', castScope: 'all', arrangement: 'faces', title: 'Characters' },
		})
		// Read on by itself stays off (P1).
		assert.equal((layout.widgetSettings as Record<string, unknown> | undefined)?.['dialogue-box'], undefined)
		assert.deepEqual(layout.widgetStyles, { 'scene-portraits': { slug: 'scene-portraits:open-stage' } })
		assert.deepEqual(storyGenre.layouts?.map((l) => l.slug), ['default', 'world', 'visual-novel'])
		assert.equal(storyGenre.layouts?.[0]?.preset, layoutsSrc.STORY_LAYOUT)
		assert.equal(storyGenre.layouts?.[2]?.preset, layout)
	})
})
