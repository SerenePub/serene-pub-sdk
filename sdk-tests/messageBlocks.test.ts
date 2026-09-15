import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMessageBlocks, MESSAGE_BLOCK_LIMITS } from '@serene-pub/sdk'

/**
 * 20 §6 — the block validator: the write-time gate that makes "render whatever
 * a sandboxed hook produced" a bounded promise. Findings name the path and
 * carry a fix; a valid tree is empty findings.
 */

describe('20 §6 · message blocks validate as data', () => {
	test('the dice tray renders: a realistic tree is clean', () => {
		const f = checkMessageBlocks([
			{ kind: 'md', text: '**Dexterity check, DC 14.**' },
			{ kind: 'stat', label: 'Roll', value: 17, max: 20 },
			{
				kind: 'kv',
				rows: [{ label: 'Modifier', value: '+2' }],
			},
			{
				kind: 'choices',
				actions: [
					{ fn: 'pick-lock', label: 'Pick it' },
					{ fn: 'force', label: 'Force it' },
				],
			},
			{
				kind: 'group',
				layout: 'row',
				blocks: [{ kind: 'md', text: 'GM whispers…' }],
			},
		])
		assert.deepEqual(f, [])
	})

	test('a form declares fields in the one field language, and its findings surface', () => {
		const ok = checkMessageBlocks([
			{
				kind: 'form',
				fn: 'answer',
				fields: { name: { type: 'string', label: 'Name' } },
			},
		])
		assert.deepEqual(ok, [])
		// A secret in a message form is the settings checker's own refusal,
		// carried through with the block path prefixed.
		const bad = checkMessageBlocks([
			{
				kind: 'form',
				fn: 'answer',
				fields: { key: { type: 'secret', side: 'component' } },
			},
		])
		assert.ok(bad.some((x) => x.path.startsWith('blocks[0].fields')))
	})

	test('refusals name the path and carry a fix', () => {
		const f = checkMessageBlocks([
			{ kind: 'md' },
			{ kind: 'choices', actions: [] },
			{ kind: 'image', assetId: 'https://evil.example/x.png' },
			{ kind: 'nope' },
		])
		const paths = f.map((x) => x.path)
		assert.ok(paths.includes('blocks[0].text'))
		assert.ok(paths.includes('blocks[1].actions'))
		assert.ok(paths.includes('blocks[2].assetId'))
		assert.ok(paths.includes('blocks[3]'))
		for (const x of f) assert.ok(x.fix.length > 0, `${x.path} has no fix`)
		// The image refusal states the law: assets, never foreign URLs.
		assert.match(f.find((x) => x.path === 'blocks[2].assetId')!.fix, /never foreign URLs/)
	})

	test('the caps hold: depth and count are bounded promises', () => {
		let deep: any = { kind: 'md', text: 'x' }
		for (let i = 0; i < MESSAGE_BLOCK_LIMITS.maxDepth + 1; i++)
			deep = { kind: 'group', blocks: [deep] }
		assert.ok(checkMessageBlocks([deep]).some((x) => /depth/.test(x.message)))

		const many = Array.from({ length: MESSAGE_BLOCK_LIMITS.maxBlocks + 1 }, () => ({
			kind: 'md',
			text: 'x',
		}))
		assert.ok(checkMessageBlocks(many).some((x) => /more than/.test(x.message)))
	})

	test('not-an-array is one finding, not a crash', () => {
		assert.equal(checkMessageBlocks({ kind: 'md' } as any).length, 1)
		assert.equal(checkMessageBlocks(null as any).length, 1)
	})
})
