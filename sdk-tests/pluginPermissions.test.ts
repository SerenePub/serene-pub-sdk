/**
 * The plugin grants guide (K1c, R50): generated from the grant table, so it
 * cannot drift, and every anchor a refusal names is a heading it renders.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { slugifyHeading } from '@serene-pub/docs'

import { PLUGIN_PERMISSIONS_GUIDE, PLUGIN_RULE_ANCHORS, renderPluginPermissionsGuide } from '@serene-pub/sdk'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the plugin grants guide', () => {
	test('the committed guide is what the table renders — run `npm run gen:plugin-permissions` after a change', () => {
		const committed = readFileSync(join(root, PLUGIN_PERMISSIONS_GUIDE), 'utf8')
		assert.equal(committed, renderPluginPermissionsGuide())
	})

	test('every anchor a refusal may name is a heading in it', () => {
		// The docs compiler's own slugger, so an anchor resolves as the site resolves it.
		const ids = new Set(
			renderPluginPermissionsGuide()
				.split('\n')
				.filter((l) => /^#{1,6} /.test(l))
				.map((l) => slugifyHeading(l.replace(/^#{1,6} /, ''))),
		)
		for (const anchor of PLUGIN_RULE_ANCHORS) assert.ok(ids.has(anchor), `no heading for '${anchor}'`)
	})
})
