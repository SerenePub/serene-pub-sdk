/**
 * `core:task/pair@1` — the two-document pair (contracts batch 2, 2026-09-17).
 *
 * A junction branches on ONE port and `equalsPath` compares two paths of ONE
 * document, so *is the accused the culprit?* is unaskable until something has
 * put both in the same document. This node is that something, and what is
 * pinned here is the pair of facts that make it safe to branch on:
 *
 *  1. **It builds and validates.** `pair` on the spine, a junction over its
 *     `main`, a branch `{ path, equalsPath }` — the shape Whodunit's verdict
 *     re-derives itself with, end to end, clean.
 *  2. **An absent side is OMITTED, never null.** `predicateHolds` answers
 *     `false` when either side is `undefined`, so a turn on which nothing was
 *     decided falls through to the default branch. `null` would destroy that:
 *     `null === null`, so a document with both sides written as null compares
 *     EQUAL and the verdict fires on a turn where nobody accused anybody.
 *
 * The handler itself is core's (`bindings.ts`); the binding here stands in for
 * it and implements the rule the declaration states, so the law is proved
 * against the document shape rather than against one host's code.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, run, ok, predicateHolds, pin, describeTaskDefinition, S } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, findings, world } from './helpers.js'

/** A branch has to land somewhere, and a write may not: F7 allows one
 *  write-class outlet per pipeline and 01 §4 keeps it off a clause's inside. */
const note = pin(
	describeTaskDefinition({
		id: 'demo:task/note@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.json } },
	}),
)

/**
 * The shape the declaration promises: what arrived is written under its key,
 * what did not is not mentioned. Deliberately written out rather than imported
 * — core's handler is the other implementation, and two that agree is the
 * point.
 */
const paired = (first: unknown, second: unknown, firstKey = 'accused', secondKey = 'culprit') => {
	const doc: Record<string, unknown> = {}
	if (first !== undefined) doc[firstKey] = first
	if (second !== undefined) doc[secondKey] = second
	return doc
}

/** accuse → pair(accused, culprit) → junction: did they name the right one? */
const verdict = () =>
	spec('demo:verdict', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.task('accused', ($: any) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
		.task('culprit', ($: any) =>
			C.pickByHash.v1({ items: $.input.fields, scopeKey: $.input.sessionScope }),
		)
		.task('pair', ($: any) =>
			C.pair.v1({
				first: $.accused.choice,
				second: $.culprit.chosenKey,
				params: { firstKey: 'accused', secondKey: 'culprit' },
			}),
		)
		.junction('verdict', { on: ($: any) => $.pair.main }, (j) =>
			j
				.when('right', { path: 'accused', equalsPath: 'culprit' }, (c) =>
					c.task('say', () => note.v1({ text: 'You have them.' })),
				)
				.otherwise('wrong', (c) => c.task('say', () => note.v1({ text: 'Not tonight.' }))),
		)

const exec = (first: unknown, second: unknown) =>
	run(publish(verdict()), {
		world,
		input: { text: '' },
		seed: 's',
		triggerSource: 'event',
		bindings: bindings({
			'core:task/read-answer@1': async () => ok({ main: {}, choice: first }),
			'core:task/pick-by-hash@1': async () => ok({ main: {}, pickIndex: 0, chosenKey: second }),
			'core:task/pair@1': async (i: any) =>
				ok({ main: paired(i.first, i.second, i.params?.firstKey, i.params?.secondKey) }),
			'demo:task/note@1': async (i: any) => ok({ main: i.text }),
		}),
	})

const branchesOf = (receipt: any): string[] =>
	receipt.nodes.filter((n: any) => n.nodeKey?.startsWith('verdict.')).map((n: any) => n.nodeKey)

describe('core:task/pair@1 · the document a junction can compare', () => {
	test('a spec pairing two ports and branching on equalsPath validates clean', () => {
		assert.deepEqual(
			findings(verdict() as any).filter((f) => f.severity === 'error'),
			[],
		)
	})

	test('both sides present and equal fires the branch; different does not', async () => {
		const right: any = await exec('character:7', 'character:7')
		assert.equal(right.outcome, 'ok')
		assert.deepEqual(branchesOf(right), ['verdict.right.say'])

		const wrong: any = await exec('character:7', 'character:9')
		assert.deepEqual(branchesOf(wrong), ['verdict.wrong.say'])
	})

	test('either side absent fires nothing — the branch falls through', async () => {
		const noAccusation: any = await exec(undefined, 'character:7')
		assert.deepEqual(branchesOf(noAccusation), ['verdict.wrong.say'])

		const noCulprit: any = await exec('character:7', undefined)
		assert.deepEqual(branchesOf(noCulprit), ['verdict.wrong.say'])

		const neither: any = await exec(undefined, undefined)
		assert.deepEqual(branchesOf(neither), ['verdict.wrong.say'])
	})

	test('⚠ null for an absent side would fire on a turn where nobody decided', () => {
		// The reason the omission is the contract and not an implementation
		// detail. Both documents describe the same run — nothing was decided —
		// and only one of them is safe to branch on.
		assert.equal(predicateHolds({ equalsPath: 'culprit' }, undefined, paired(undefined, undefined)), false)
		const nulled = { accused: null, culprit: null }
		assert.equal(predicateHolds({ equalsPath: 'culprit' }, nulled.accused, nulled), true)
	})

	test('the keys are the spec’s own words, and an absent key is simply not there', () => {
		assert.deepEqual(paired('a', 'b', 'guess', 'secret'), { guess: 'a', secret: 'b' })
		assert.deepEqual(Object.keys(paired('a', undefined)), ['accused'])
		assert.deepEqual(Object.keys(paired(undefined, undefined)), [])
	})
})
