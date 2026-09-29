/**
 * Typed templates P3 (2026-09-27): `templateScopeAt` — what a template slot
 * can reference at one node of one document, typed.
 *
 * The scope is the node's own static names (Assemble's, corrected to what
 * `render()` supplies), its `prompts` fields (followed through a slot
 * reference), every key its upstream context builder declares on its
 * template-context out-port (`portSchemas`), the bands declared upstream,
 * `annex.<owner>.<key>` for every declared annex key in scope, and `state`
 * typed from the genre's attribute slots. A root two declarers claim is
 * refused naming both; a forbidden kind (a secret, connection or model
 * identity, debug metadata, embeddings) is refused by name.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	BandCollisionError,
	ForbiddenTemplateFieldError,
	S,
	annexField,
	compile,
	declareAnnex,
	defineAttributeSlot,
	definePluginVariable,
	describeTaskDefinition,
	genre,
	getDefinition,
	pin,
	sessionEvents,
	spec,
	templateScopeAt,
	templateScopeReport,
	type AttributeSlotDecl,
	type DocNode,
	type VarField,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_SPECS } from '@serene-pub/core-catalog'

// ── The Twenty Questions shape, as a fixture ───────────────────────────────

const TQ = 'showcase.twenty-questions'

const varSecretEntry = definePluginVariable(TQ, {
	id: `${TQ}:var/secret-entry@1`,
	i18n: { name: { en: 'Secret entry' } },
	description: { en: 'The entry the character is thinking of.' },
	scope: { secretEntry: { type: 'record', of: { type: 'string' } } },
	sample: { 'The Clocktower': 'A brass clocktower.' },
})
const varBriefing = definePluginVariable(TQ, {
	id: `${TQ}:var/briefing@1`,
	i18n: { name: { en: 'Briefing' } },
	scope: { briefing: { type: 'record', of: { type: 'string' } } },
	sample: { 'How to answer': 'Say yes.' },
})

const pickSecret = pin(
	describeTaskDefinition({
		id: `${TQ}:task/pick-secret-entry@1`,
		timeoutMs: 500,
		bands: { secretEntry: varSecretEntry },
		ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
	}),
)
const tally = pin(
	describeTaskDefinition({
		id: `${TQ}:task/tally-question@1`,
		timeoutMs: 500,
		bands: { briefing: varBriefing },
		ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
	}),
)

const tqGenre = genre(`${TQ}:genre/game`, {
	name: { en: 'Twenty Questions' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true } },
})

declareAnnex(TQ, [
	annexField({
		key: 'secret',
		shape: {
			type: 'object',
			fields: {
				secretEntryId: { type: 'integer', min: 0 },
				secretEntryName: { type: 'string' },
				secretEntryText: { type: 'string' },
				secretEntryAliases: { type: 'list', item: { type: 'string' } },
			},
		},
		see: ['ai'],
	}),
])

/**
 * Speak path: context builder → assemble, two plugin sources beside core's
 * lore — and, with `annex`, the template-view annex read on Assemble's
 * `annex` port (P6).
 */
const tqSpec = (opts: { annex?: boolean } = { annex: true }) =>
	spec(`${TQ}:spec/respond`, { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: tqGenre, event: sessionEvents.messageRespond })
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
		.task('context', ($) => C.buildTemplateContext.v1({ cast: $.cast.cast }))
		.query('lore', ($) => C.lorebookTriggers.v1({ scope: $.input.sessionScope }))
		.task('secret', () => pickSecret.v1({}))
		.task('tally', () => tally.v1({}))
		.task('pool', ($) =>
			C.concatCandidates.v1({ sources: [$.lore.hits, $.secret.candidates, $.tally.candidates] as never }),
		)
		.task('rank', ($) => C.rankHybrid.v1({ candidates: $.pool.candidates }))
		.query('annexRead', ($) => C.sessionAnnex.v1({ scope: $.input.sessionScope, view: 'template' }))
		.task('speakPrompt', ($) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				templateContext: $.context.templateContext,
				...(opts.annex ? { annex: $.annexRead.main } : {}),
			}),
		)
		.build()

const field = (scope: Record<string, unknown>, root: string): VarField => {
	const f = scope[root]
	assert.ok(f && typeof f === 'object' && !Array.isArray(f), `'${root}' is in scope and typed`)
	return f as VarField
}

// ── The shipped catalog ────────────────────────────────────────────────────

describe('P3 · every shipped core template slot has a scope, with zero findings', () => {
	const templateNodes = (doc: { nodes: DocNode[] }) =>
		doc.nodes.filter((n) =>
			Object.values(getDefinition(`${n.definitionId}@${n.definitionVersion}`)?.slots ?? {}).some(
				(s) => s.kind === 'template',
			),
		)

	test('no throw, no finding, at every node with a template slot', () => {
		let seen = 0
		for (const entry of CORE_SPECS) {
			const doc = entry.build()
			for (const n of templateNodes(doc)) {
				seen++
				const report = templateScopeReport(doc, n.key)
				assert.deepEqual(report.findings, [], `${doc.id} at '${n.key}'`)
			}
		}
		assert.ok(seen > 0, 'the catalog renders at least one template')
	})

	test("respond's Assemble scope is what render() supplies", () => {
		const doc = CORE_SPECS.find((s) => s.slug === 'core:spec/respond')!.build()
		const node = doc.nodes.find((n: DocNode) => n.definitionId === 'core:task/assemble')!
		const scope = templateScopeAt(doc, node.key)
		// The builder's declared keys…
		for (const k of ['characters', 'personas', 'scenario', 'instructions', 'char', 'user', 'characterNames'])
			assert.equal(field(scope, k).type, 'string', k)
		assert.equal(field(scope, 'state').type, 'object')
		// …the prompts slot, followed through its reference to the builder…
		assert.equal(field(scope, 'systemPrompt').type, 'string')
		// …and Assemble's own, corrected.
		assert.equal(field(scope, 'worldLore').type, 'string')
		assert.equal(field(scope, 'budget').fields?.remaining?.type, 'number')
		assert.equal(field(scope, 'sessionMessages').of?.fields?.role?.type, 'string')
		assert.equal(field(scope, 'postHistory').fields?.targetIndex?.type, 'number')
		assert.equal(field(scope, 'injectionsByIndex').type, 'record')
		assert.equal(field(scope, 'characterLore').type, 'list')
		// Names render() never supplies are gone.
		assert.equal(scope.blocks, undefined)
		assert.equal(scope.prompts, undefined)
	})
})

// ── Twenty Questions ───────────────────────────────────────────────────────

describe('P3 · the Twenty Questions scope', () => {
	test('secretEntry, briefing and annex."showcase.twenty-questions".secret are in scope, typed', () => {
		const doc = compile(tqSpec())
		const scope = templateScopeAt(doc, 'speakPrompt', { genre: tqGenre.id })
		assert.equal(field(scope, 'secretEntry').type, 'string')
		assert.equal(field(scope, 'briefing').type, 'string')
		const secret = field(scope, 'annex').fields?.[TQ]?.fields?.secret
		assert.ok(secret, 'annex."showcase.twenty-questions".secret is in scope')
		assert.equal(secret!.type, 'object')
		assert.equal(secret!.fields?.secretEntryName?.type, 'string')
		assert.equal(secret!.fields?.secretEntryId?.type, 'number')
		assert.deepEqual(secret!.fields?.secretEntryAliases, { type: 'list', of: { type: 'string' }, optional: true })
		// Core declares one key since lair pass R2 (2026-09-28): retake's
		// "don't ask again", typed from its boolean shape.
		assert.deepEqual(field(scope, 'annex').fields?.core?.fields?.['retake-quietly'], {
			type: 'boolean',
			optional: true,
		})
	})

	test('P6: annex is in scope only where the annex port is wired', () => {
		const unwired = templateScopeAt(compile(tqSpec({ annex: false })), 'speakPrompt', { genre: tqGenre.id })
		assert.equal(unwired.annex, undefined, 'no annex port fed → no annex in scope, so a template naming it is refused')
		const wired = templateScopeAt(compile(tqSpec()), 'speakPrompt', { genre: tqGenre.id })
		assert.ok(field(wired, 'annex').fields?.[TQ])
	})

	test('P6: an owner not in scope contributes no branch', () => {
		const scope = templateScopeAt(compile(tqSpec()), 'speakPrompt', { genre: tqGenre.id, owners: ['core'] })
		// Only core's own branch (its one key since R2, 2026-09-28); the
		// plugin, not in scope, adds none.
		assert.deepEqual(Object.keys(field(scope, 'annex').fields ?? {}), ['core'])
		assert.equal(field(scope, 'annex').fields?.[TQ], undefined)
	})

	test("state is typed from the genre's attribute slots", () => {
		const hp = defineAttributeSlot('scopetest:slot/hp@1', {
			type: 'integer',
			descriptor: 'hit points',
			appliesTo: ['cast'],
		})
		const weather = defineAttributeSlot('scopetest:slot/weather@1', {
			type: 'text',
			descriptor: 'the weather',
			appliesTo: ['world'],
		})
		const doc = compile(tqSpec())
		const state = field(templateScopeAt(doc, 'speakPrompt', { slots: [hp, weather] }), 'state')
		assert.equal(state.fields?.world?.fields?.weather?.type, 'string')
		assert.equal(state.fields?.world?.fields?.scopetest_weather?.type, 'string')
		assert.equal(state.fields?.cast?.of?.fields?.hp?.type, 'number')
		assert.equal(state.fields?.cast?.of?.fields?.name?.type, 'string')
		// No location slot tracked → a place carries only who it is.
		assert.deepEqual(Object.keys(state.fields?.locations?.of?.fields ?? {}), ['id', 'key', 'name'])
	})

	test('P6: state.locations.<place>.<slot> is typed from location slots', () => {
		const loot = defineAttributeSlot('scopetest:slot/loot@1', {
			type: 'text',
			descriptor: 'what lies here',
			appliesTo: ['location'],
		})
		const state = field(templateScopeAt(compile(tqSpec()), 'speakPrompt', { slots: [loot] }), 'state')
		assert.equal(state.fields?.locations?.type, 'record')
		assert.equal(state.fields?.locations?.of?.fields?.loot?.type, 'string')
		assert.equal(state.fields?.locations?.of?.fields?.key?.type, 'string')
		// A location slot is not a cast member's nor the world's.
		assert.equal(state.fields?.cast?.of?.fields?.loot, undefined)
		assert.equal(state.fields?.world?.fields?.loot, undefined)
	})
})

// ── Refusals ───────────────────────────────────────────────────────────────

/** A context builder whose declared payload claims one of core's own names. */
const rivalBuilder = (out: VarField) =>
	pin(
		describeTaskDefinition({
			id: `scopetest:task/rival-context-${Math.random().toString(36).slice(2, 8)}@1`,
			timeoutMs: 500,
			ports: { in: {}, out: { main: S.templateContext, templateContext: S.templateContext } },
			portSchemas: { out: { templateContext: out } },
		}),
	)

describe('P3 · refusals', () => {
	test('a root two declarers claim is refused, naming both', () => {
		const doc = compile(tqSpec())
		// The secret band's source is now also a context builder claiming `secretEntry`.
		const base = (n: DocNode) => getDefinition(`${n.definitionId}@${n.definitionVersion}`)
		const describeNode = (n: DocNode) =>
			n.key === 'context'
				? {
						...base(n)!,
						portSchemas: {
							out: { templateContext: { type: 'object', fields: { secretEntry: { type: 'string' } } } as VarField },
						},
					}
				: base(n)
		assert.throws(
			() => templateScopeAt(doc, 'speakPrompt', { describe: describeNode }),
			(e: Error) =>
				e instanceof BandCollisionError &&
				/'secretEntry'/.test(e.message) &&
				/'secret' \(showcase\.twenty-questions:task\/pick-secret-entry@1\)/.test(e.message) &&
				/'context' \(core:task\/build-template-context@1\)/.test(e.message),
		)
	})

	test('a forbidden kind is refused by name — model identity, debug metadata, embeddings', () => {
		for (const [name, f] of [
			['modelId', { type: 'string' }],
			['debugMeta', { type: 'record' }],
			['embedding', { type: 'list', of: { type: 'number' } }],
		] as const) {
			const builder = rivalBuilder({ type: 'object', fields: { safe: { type: 'string' }, [name]: f } as never })
			const doc = compile(
				spec('scopetest:spec/forbidden', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1(), { genre: tqGenre, event: sessionEvents.messageRespond })
					.task('context', () => builder.v1({}))
					.task('prompt', ($) => C.assemble.v2({ templateContext: $.context.templateContext }))
					.build(),
			)
			assert.throws(
				() => templateScopeAt(doc, 'prompt'),
				(e: Error) =>
					e instanceof ForbiddenTemplateFieldError &&
					e.message.includes(`'${name}'`) &&
					e.message.includes("'context'"),
				name,
			)
		}
	})

	test('a secret attribute slot is refused, never silently typed', () => {
		// `defineAttributeSlot` already refuses a secret shape; a stored row
		// read back by a host is the door this guards.
		const secretSlot = {
			id: 'scopetest:slot/password@1',
			type: 'text',
			shape: { type: 'secret' },
			descriptor: 'a password',
			appliesTo: ['world'],
			origin: 'stored',
		} as unknown as AttributeSlotDecl
		const doc = compile(tqSpec())
		assert.throws(
			() => templateScopeAt(doc, 'speakPrompt', { slots: [secretSlot] }),
			(e: Error) => e instanceof ForbiddenTemplateFieldError && /password/.test(e.message),
		)
	})
})
