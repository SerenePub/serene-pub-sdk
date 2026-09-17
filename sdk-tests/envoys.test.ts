/**
 * Envoys (plans/29 R-18, R-21 (6); 09-B B10; ruled 2026-09-15, built
 * 2026-09-16 as U5g).
 *
 * What is pinned: a genre declares envoys as an array and the declaration is
 * checked at `genre()` — unique keys, at most one default, a name with `en`,
 * `speaks` stated (`in-turn` unless said); an action's envoy is `on-action`
 * by construction and a declaration saying otherwise is refused; there is no
 * path to an envoy outside those two places; `slot.prompts({ envoy })`
 * compiles to the config address `envoy:<key>` after the genre is checked,
 * and the executor resolves that address through the config chain like a
 * node's — an author default at the bottom, a deviation above it.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	genre,
	getGenre,
	genreEnvoys,
	genreEnvoy,
	envoyFindings,
	envoysFindings,
	envoyIdentity,
	envoySlugOf,
	envoySlugOfRef,
	envoyConfigKey,
	envoyConfigKeysOf,
	actionFindings,
	normalizeAction,
	sessionEvents,
	slot,
	spec,
	compile,
	run,
	ok,
	type ConfigWorld,
	type EnvoyDecl,
	type GenreDecl,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { world } from './helpers.js'

const mascot: EnvoyDecl = {
	key: 'mascot',
	name: { en: 'Guide' },
	description: { en: 'The helper.' },
	prompts: { systemPrompt: 'You are the guide.' },
	default: true,
}
const herald: EnvoyDecl = { key: 'herald', name: { en: 'Herald' }, speaks: 'on-action' }

let counter = 0
const fresh = (props: Partial<Parameters<typeof genre>[1]> = {}): GenreDecl =>
	genre(`test.envoys:genre/g${counter++}`, {
		name: { en: 'G' },
		family: 'chat',
		envoys: [mascot, herald],
		...props,
	})

describe('a genre declares envoys', () => {
	test('two envoys, one default; speaks defaults to in-turn and is stated on the declaration', () => {
		const g = fresh()
		assert.equal(g.envoys?.length, 2)
		assert.deepEqual(
			g.envoys?.map((e) => [e.key, e.speaks, e.default ?? false]),
			[
				['mascot', 'in-turn', true],
				['herald', 'on-action', false],
			],
		)
		assert.ok(Object.isFrozen(g.envoys), 'the list is frozen')
		assert.ok(Object.isFrozen(g.envoys![0]), 'each entry is frozen')
		// Read back by id, and by key.
		assert.equal(genreEnvoys(g.id).length, 2)
		assert.equal(genreEnvoy(g, 'mascot')?.name.en, 'Guide')
		assert.equal(genreEnvoy(g.id, 'nobody'), undefined)
		// A genre this build never declared answers with none — never a guess.
		assert.deepEqual(genreEnvoys('nobody:genre/x'), [])
		// A genre with none carries no key at all, so its hash is what it was.
		assert.equal('envoys' in fresh({ envoys: undefined }), false)
	})

	test('a duplicate key, two defaults and a name without en are refused with sentences', () => {
		assert.throws(
			() => fresh({ envoys: [mascot, { ...herald, key: 'mascot' }] }),
			/'mascot' is declared 2 times/,
		)
		assert.throws(
			() => fresh({ envoys: [mascot, { ...herald, default: true }] }),
			/2 envoys are 'default: true'/,
		)
		assert.throws(
			() => fresh({ envoys: [{ ...mascot, name: { fr: 'Guide' } as any }] }),
			/name is a locale map with a required 'en'/,
		)
		assert.throws(() => fresh({ envoys: [{ ...mascot, name: 'Guide' as any }] }), /required 'en'/)
		assert.throws(() => fresh({ envoys: [{ ...mascot, key: 'Has.Dots' }] }), /lowercase kebab/)
		assert.throws(() => fresh({ envoys: [{ ...mascot, speaks: 'sometimes' as any }] }), /'in-turn' or 'on-action'/)
		// The list form is the whole rule; the findings are sentences, not throws.
		assert.deepEqual(envoysFindings(undefined), [])
		assert.match(envoysFindings({ key: 'x' })[0]!, /are an array/)
		assert.equal(envoyFindings(mascot, 'x').length, 0)
	})

	test("an image is an <img> source and nothing else: http(s) or data:image, refused otherwise", () => {
		const ok = (image: string) => assert.equal(envoyFindings({ ...mascot, image }, 'x').length, 0, image)
		ok('https://example.com/mascot.png')
		ok('http://localhost:5173/mascot.svg')
		ok('data:image/png;base64,iVBORw0KGgo=')
		ok('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E')
		ok('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>')
		const refused = (image: unknown) => {
			const findings = envoyFindings({ ...mascot, image } as EnvoyDecl, 'x')
			assert.equal(findings.length, 1, String(image))
			assert.match(findings[0]!, /'image' is an http\(s\):\/\/ URL or a data:image/)
		}
		refused('')
		refused('mascot.png')
		refused('/static/mascot.png')
		refused('javascript:alert(1)')
		refused('data:text/html,<script>alert(1)</script>')
		refused('data:image/png')
		refused('ftp://example.com/mascot.png')
		refused(42)
		// And at the declaration, as a throw.
		assert.throws(() => fresh({ envoys: [{ ...mascot, image: 'javascript:alert(1)' }] }), /'image' is an http/)
	})

	test('a re-declaration with the same envoys is a no-op; a different one throws', () => {
		const id = 'test.envoys:genre/redeclare'
		const props = { name: { en: 'R' }, family: 'chat', envoys: [mascot] }
		const first = genre(id, props)
		assert.equal(genre(id, props).envoys?.length, first.envoys?.length)
		// Display text is not content: a renamed envoy reloads without a throw.
		genre(id, { ...props, envoys: [{ ...mascot, name: { en: 'Renamed' } }] })
		assert.equal(getGenre(id)?.envoys?.[0]?.name.en, 'Renamed')
		// A changed prompt is content — it is the envoy's configuration default.
		assert.throws(
			() => genre(id, { ...props, envoys: [{ ...mascot, prompts: { systemPrompt: 'other' } }] }),
			/duplicate genre id/,
		)
	})
})

describe("an action's envoy", () => {
	const base = {
		key: 'roll',
		function: 'roll',
		genre: 'core:genre/chat',
		venue: { kind: 'composer' as const },
		label: { en: 'Roll' },
	}

	test('is on-action by construction; in-turn is refused', () => {
		const normalized = normalizeAction({ ...base, envoy: { key: 'master', name: { en: 'Dice Master' } } })
		assert.equal(normalized.envoy?.speaks, 'on-action')
		assert.deepEqual(actionFindings(normalized, 'acme:spec/dice'), [])
		const findings = actionFindings(
			{ ...base, envoy: { key: 'master', name: { en: 'Dice Master' }, speaks: 'in-turn' } },
			'acme:spec/dice',
		)
		assert.equal(findings.length, 1)
		assert.match(findings[0]!, /speaks 'on-action' only/)
		// The envoy itself is checked like a genre's.
		assert.match(
			actionFindings({ ...base, envoy: { key: 'master', name: 'Dice Master' } }, 'acme:spec/dice')[0]!,
			/required 'en'/,
		)
	})

	test('is addressed under the spec namespace, so it cannot collide with a genre key', () => {
		assert.equal(envoyIdentity({ action: { specId: 'acme:spec/dice' } }, 'master'), 'envoy:acme.master')
		assert.equal(envoyIdentity({ genre: 'core:genre/guide' }, 'mascot'), 'envoy:mascot')
		// Core's actions too — unlike a slash name, every action's envoy is dotted.
		assert.equal(envoySlugOf({ action: { specId: 'core:spec/dice' } }, 'master'), 'core.master')
		assert.throws(() => envoySlugOf({ action: { specId: 'no-namespace' } }, 'x'), /no namespace/)
		assert.equal(envoySlugOfRef('envoy:acme.master'), 'acme.master')
		assert.equal(envoySlugOfRef('character:3'), null)
		assert.equal(envoySlugOfRef(undefined), null)
	})

	test('there is no path to an envoy outside a genre or an action', () => {
		const g = fresh()
		// The declaration is frozen: nothing appends to a genre's list.
		assert.throws(() => (g.envoys as EnvoyDecl[]).push(herald), TypeError)
		// An identity needs an owner — there is no bare form.
		assert.throws(() => envoyIdentity({} as any, 'x'))
		// And the SDK exports no `addEnvoy`/`registerEnvoy`: the two declaring
		// places are `GenreDecl.envoys` and `ActionDecl.envoy`, checked above.
	})
})

describe('slot.prompts({ envoy }) — configuration at envoy:<key>', () => {
	const g = fresh()

	test('compiles to the config address after the genre is checked', () => {
		const doc = compile(
			spec('test.envoys:spec/reply', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
				.task('context', ($: any) =>
					C.buildTemplateContext.v1({
						cast: $.input.main,
						speaker: $.input.speaker,
						prompts: slot.prompts({ envoy: 'mascot' }),
						variables: slot.variables(),
					}),
				)
				.build(),
		)
		const context = doc.nodes.find((n) => n.key === 'context')!
		assert.equal(context.resolvedRefs?.prompts, envoyConfigKey('mascot'))
		assert.equal(context.resolvedRefs?.prompts, 'envoy:mascot')
		assert.deepEqual(envoyConfigKeysOf(doc), ['envoy:mascot'])
		// The stored form says what it is.
		assert.deepEqual(context.config.prompts, { __ref: 'slot', slot: 'prompts', ofEnvoy: 'mascot' })
	})

	test("a node key containing ':' is refused — the colon marks a synthetic config address", () => {
		assert.throws(
			() =>
				spec('test.envoys:spec/colon-key', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
					.task('envoy:mascot', ($: any) =>
						C.buildTemplateContext.v1({ cast: $.input.main, prompts: slot.prompts({ envoy: 'mascot' }) }),
					),
			/node key 'envoy:mascot' contains ':' — a colon marks a synthetic config address/,
		)
		// Not only the envoy prefix: any colon, so no node can ever be read as an address.
		assert.throws(
			() =>
				spec('test.envoys:spec/colon-key-2', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
					.task('a:b', ($: any) => C.buildTemplateContext.v1({ cast: $.input.main })),
			/node key 'a:b' contains ':'/,
		)
	})

	test('an envoy the genre does not declare, or a spec with no genre, is refused', () => {
		assert.throws(
			() =>
				compile(
					spec('test.envoys:spec/bad-key', { version: '1.0.0' })
						.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
						.task('context', ($: any) =>
							C.buildTemplateContext.v1({ cast: $.input.main, prompts: slot.prompts({ envoy: 'nobody' }) }),
						)
						.build(),
				),
			/envoy 'nobody', which .* does not declare — it declares 'mascot', 'herald'/,
		)
		assert.throws(
			() =>
				compile(
					spec('test.envoys:spec/no-genre', { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.task('context', ($: any) =>
							C.buildTemplateContext.v1({ cast: $.input.main, prompts: slot.prompts({ envoy: 'mascot' }) }),
						)
						.build(),
				),
			/serves no genre/,
		)
	})

	test('the executor resolves it through the chain: author default, then a deviation above it', async () => {
		const doc = compile(
			spec('test.envoys:spec/resolve', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
				.task('context', ($: any) =>
					C.buildTemplateContext.v1({
						cast: $.input.main,
						prompts: slot.prompts({ envoy: 'mascot' }),
						variables: slot.variables(),
					}),
				)
				.build(),
		)
		const seen: unknown[] = []
		const bindings = {
			'core:inlet/user-message@1': async (input: any) => ok(input),
			'core:task/build-template-context@1': async (input: any) => {
				seen.push(input.prompts)
				return ok({ main: {}, templateContext: {}, seedName: 'Guide' })
			},
		}
		// The host projects the genre's declaration at `author` — exactly as
		// it projects a node's declared defaults — at the envoy's address.
		const projected: ConfigWorld = {
			...world,
			authorDefaults: { 'envoy:mascot': { prompts: { systemPrompt: 'You are the guide.' } } },
		}
		await run(doc, { bindings, world: projected, input: { main: {}, text: 'hi' } })
		assert.deepEqual(seen[0], { systemPrompt: 'You are the guide.' })

		// A deviation at `preset` — the panel's write — wins over it.
		const tuned: ConfigWorld = {
			...projected,
			overrides: [
				{ nodeKey: 'envoy:mascot', slot: 'prompts', path: 'systemPrompt', value: 'Tuned.', scopeKind: 'preset' },
			],
		}
		await run(doc, { bindings, world: tuned, input: { main: {}, text: 'hi' } })
		assert.deepEqual(seen[1], { systemPrompt: 'Tuned.' })

		// And a session's own override wins over the config's.
		const session: ConfigWorld = {
			...tuned,
			overrides: [
				...tuned.overrides,
				{ nodeKey: 'envoy:mascot', slot: 'prompts', path: 'systemPrompt', value: 'Mine.', scopeKind: 'session', scopeId: 7 },
			],
		}
		await run(doc, { bindings, world: session, input: { main: {}, text: 'hi' } })
		assert.deepEqual(seen[2], { systemPrompt: 'Mine.' })
	})
})

describe('the shipped guide genre', () => {
	test('one envoy, default, in-turn; characters max 0; the reply reads its prompts by reference', async () => {
		const { guideGenre, guideRespondSpec, createGuideSpec, GUIDE_MASCOT_KEY } = await import(
			'@serene-pub/core-catalog'
		)
		assert.equal(guideGenre.shape?.characters?.max, 0)
		assert.equal(guideGenre.envoys?.length, 1)
		assert.equal(guideGenre.envoys?.[0]?.key, GUIDE_MASCOT_KEY)
		assert.equal(guideGenre.envoys?.[0]?.default, true)
		assert.equal(guideGenre.envoys?.[0]?.speaks, 'in-turn')
		assert.equal(typeof guideGenre.envoys?.[0]?.prompts?.systemPrompt, 'string')
		const reply = guideRespondSpec()
		const context = reply.nodes.find((n: any) => n.key === 'context')!
		assert.equal(context.resolvedRefs?.prompts, 'envoy:mascot')
		// The create spec carries the envoys on the row for the host to read.
		const create = createGuideSpec()
		assert.equal((create.genre as any)?.envoys?.[0]?.key, 'mascot')
	})
})
