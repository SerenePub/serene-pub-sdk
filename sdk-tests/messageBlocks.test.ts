import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	checkMessageBlocks,
	stampBlockActions,
	MESSAGE_BLOCK_LIMITS,
	type MessageBlock,
} from '@serene-pub/sdk'

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

/**
 * W-E (U5c review, 2026-09-16): a block's button carries the identity of the
 * declaration it fires, stamped by the outlet from the run's spec — never by
 * the client — so the server holds the press to THAT action's audience. A
 * block carrying none is the legacy shape and gets the owner floor.
 */
describe('W-E · a block action carries the identity of the declaration it fires', () => {
	// `fn` is the action's KEY (plans/31 V2): the spec's declarations name it
	// at most once, so a stamp is a lookup and never a guess.
	const spec = {
		id: 'acme:spec/lock',
		contributes: {
			actions: [
				{ key: 'pick-lock', genre: 'core:genre/chat', venue: { kind: 'message' }, label: { en: 'Pick' } },
				{ key: 'force', genre: 'core:genre/chat', venue: { kind: 'message' }, label: { en: 'Force' } },
			],
		},
	}
	const tree: MessageBlock[] = [
		{
			kind: 'choices',
			actions: [
				{ fn: 'pick-lock', label: 'Pick it' },
				{ fn: 'force', label: 'Force it' },
				{ fn: 'walk-away', label: 'Leave' },
				{ fn: 'pick-lock', label: 'Pick, as core', action: 'core:spec/lock#pick' },
			],
		},
		{ kind: 'group', blocks: [{ kind: 'form', fn: 'pick-lock', fields: {} }] },
	]

	test('the outlet stamps the action of the spec whose key is each fn; undeclared stays legacy; a stated one is kept', () => {
		const stamped = stampBlockActions(tree, spec)
		const choices = stamped[0] as Extract<MessageBlock, { kind: 'choices' }>
		assert.deepEqual(
			choices.actions.map((a) => a.action),
			['acme:spec/lock#pick-lock', 'acme:spec/lock#force', undefined, 'core:spec/lock#pick'],
		)
		const group = stamped[1] as Extract<MessageBlock, { kind: 'group' }>
		assert.equal((group.blocks[0] as Extract<MessageBlock, { kind: 'form' }>).action, 'acme:spec/lock#pick-lock')
		// A copy: the input tree is what it was.
		assert.equal((tree[0] as any).actions[0].action, undefined)
		// …and what it stamped validates.
		assert.deepEqual(checkMessageBlocks(stamped), [])
	})

	test('a present action is held to the identity grammar; absent is fine', () => {
		const f = checkMessageBlocks([
			{ kind: 'choices', actions: [{ fn: 'x', label: 'x', action: 'not an identity' }] },
			{ kind: 'form', fn: 'y', fields: {}, action: 'acme:spec/lock@1#pick' },
			{ kind: 'form', fn: 'z', fields: {} },
		])
		assert.deepEqual(
			f.map((x) => x.path),
			['blocks[0].actions[0].action', 'blocks[1].action'],
		)
		assert.match(f[0]!.fix, /<spec slug>#<key>/)
	})
})
