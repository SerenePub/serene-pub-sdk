/**
 * Typed templates P5 (2026-09-27): refusals. A template is checked against the
 * typed scope of the node that renders it, and a name or path nothing there
 * supplies is refused — at a spec's save (law T1, `validate()`), at packaging
 * (a plugin's template seeds), and at selection (the host, through
 * `templateFit`). Warnings never refuse, and nothing refuses while a producer
 * upstream declares no types.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	S,
	annexField,
	annexPortFindings,
	compile,
	declareAnnex,
	defineExtension,
	definePluginVariable,
	describeTaskDefinition,
	genre,
	getDefinition,
	handlebars,
	pin,
	sessionEvents,
	spec,
	templateFit,
	templateFitSentence,
	templateLawFindings,
	templateSeedFindings,
	validate,
	type DocNode,
	type TemplateSeed,
} from '@serene-pub/sdk'
import { checkTemplateSourceReport } from '@serene-pub/sdk/template-check'
import { compilePlugin, renderFindings } from '@serene-pub/cli'
import * as C from '@serene-pub/contracts'
import { CORE_SPECS } from '@serene-pub/core-catalog'

const checking = { check: checkTemplateSourceReport }

// ── A Twenty-Questions-shaped fixture (own ids: this file is its own process) ─

const NS = 'fittest.riddles'

const varSecret = definePluginVariable(NS, {
	id: `${NS}:var/secret-entry@1`,
	i18n: { name: { en: 'Secret entry' } },
	scope: { secretEntry: { type: 'record', of: { type: 'string' } } },
	sample: { Clocktower: 'A brass clocktower.' },
})

const pickSecret = pin(
	describeTaskDefinition({
		id: `${NS}:task/pick-secret-entry@1`,
		timeoutMs: 500,
		bands: { secretEntry: varSecret },
		ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
	}),
)

const riddles = genre(`${NS}:genre/riddles`, {
	name: { en: 'Riddles' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true } },
})

const GOOD =
	'{{#if secretEntry}}Thinking of: {{{secretEntry}}}{{/if}}\n{{{characters}}}\n{{{worldLore}}}'
const TYPO = '{{#if secretEntri}}Thinking of: {{{secretEntri}}}{{/if}}\n{{{characters}}}'

const riddleSpec = (
	source = GOOD,
	id = `${NS}:spec/respond`,
	annex?: 'template' | 'ai' | 'cast',
) =>
	spec(id, { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: riddles, event: sessionEvents.messageRespond })
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
		.task('context', ($) => C.buildTemplateContext.v1({ cast: $.cast.cast }))
		.query('lore', ($) => C.lorebookTriggers.v1({ scope: $.input.sessionScope }))
		.task('secret', () => pickSecret.v1({}))
		.task('pool', ($) =>
			C.concatCandidates.v1({ sources: [$.lore.hits, $.secret.candidates] as never }),
		)
		.task('rank', ($) => C.rankHybrid.v1({ candidates: $.pool.candidates }))
		.query('annexRead', ($) =>
			C.sessionAnnex.v1({ scope: $.input.sessionScope, view: annex === 'ai' ? 'ai' : 'template' }),
		)
		.task('speakPrompt', ($) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				templateContext: $.context.templateContext,
				...(annex === 'cast'
					? { annex: $.cast.cast as never }
					: annex
						? { annex: $.annexRead.main }
						: {}),
			}),
		)
		.preset('riddles', { label: { en: 'Riddles' }, default: true }, (p) =>
			p.template('speakPrompt', { engine: handlebars.id, source }),
		)
		.build()

// ── The sentence ────────────────────────────────────────────────────────────

describe('P5 · templateFit', () => {
	test('a name nothing supplies is a refusal, with did-you-mean and what is available', () => {
		const doc = compile(riddleSpec())
		const fit = templateFit(
			doc,
			'speakPrompt',
			{ engine: handlebars.id, source: TYPO },
			checking,
		)
		assert.equal(fit.checked, true)
		assert.deepEqual(fit.untyped, [])
		assert.equal(fit.refusals[0]?.name, 'secretEntri')
		const sentence = templateFitSentence('speakPrompt', "'Riddle layout'", fit.refusals)
		assert.match(
			sentence,
			/^'speakPrompt' can't render 'Riddle layout': it uses `secretEntri`, which nothing supplies here\. Did you mean `secretEntry`\? Available: .*`secretEntry`/,
		)
	})

	test('a clean template has no refusals', () => {
		const doc = compile(riddleSpec())
		const fit = templateFit(
			doc,
			'speakPrompt',
			{ engine: handlebars.id, source: GOOD },
			checking,
		)
		assert.deepEqual(fit.refusals, [])
	})

	test('an untyped producer upstream turns every name finding into a warning', () => {
		const loose = pin(
			describeTaskDefinition({
				id: `${NS}:task/loose-context@1`,
				timeoutMs: 500,
				ports: {
					in: {},
					out: { main: S.templateContext, templateContext: S.templateContext },
				},
			}),
		)
		const doc = compile(
			spec(`${NS}:spec/loose`, { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), {
					genre: riddles,
					event: sessionEvents.messageRespond,
				})
				.task('context', () => loose.v1({}))
				.task('prompt', ($) =>
					C.assemble.v2({ templateContext: $.context.templateContext }),
				)
				.build(),
		)
		const fit = templateFit(
			doc,
			'prompt',
			{ engine: handlebars.id, source: '{{{whatever}}}' },
			checking,
		)
		assert.ok(fit.untyped.length > 0)
		assert.deepEqual(fit.refusals, [])
		assert.equal(fit.warnings[0]?.name, 'whatever')
		assert.equal(fit.warnings[0]?.severity, 'warning')
	})

	test('an unknown helper is not a scope refusal by default (host vocabulary)', () => {
		const doc = compile(riddleSpec())
		const fit = templateFit(
			doc,
			'speakPrompt',
			{ engine: handlebars.id, source: '{{#systemBlock}}{{{characters}}}{{/systemBlock}}' },
			checking,
		)
		assert.deepEqual(fit.refusals, [])
	})
})

// ── Law T1 ──────────────────────────────────────────────────────────────────

describe('P5 · law T1 (validate)', () => {
	test("a preset's template naming nothing in scope is refused at validate", () => {
		const doc = compile(riddleSpec(TYPO, `${NS}:spec/typo`))
		const t1 = validate(doc, { templates: checking }).filter((f) => f.law === 'T1')
		assert.equal(t1.length, 1)
		assert.equal(t1[0]!.severity, 'error')
		assert.equal(t1[0]!.nodeKey, 'speakPrompt')
		assert.match(
			t1[0]!.message,
			/can't render the 'riddles' preset's template: it uses `secretEntri`/,
		)
		assert.match(t1[0]!.message, /Did you mean `secretEntry`\?/)
		assert.equal(t1[0]!.fix, 'use "secretEntry"')
	})

	test('the same template passes when it names what is supplied', () => {
		const doc = compile(riddleSpec())
		assert.deepEqual(
			validate(doc, { templates: checking }).filter((f) => f.law === 'T1'),
			[],
		)
	})

	test('without a checker, T1 reads no source', () => {
		const doc = compile(riddleSpec(TYPO, `${NS}:spec/typo-unchecked`))
		assert.deepEqual(
			validate(doc).filter((f) => f.law === 'T1'),
			[],
		)
	})

	test('a band reaching Assemble with an unregistered variable is refused', () => {
		const doc = compile(riddleSpec())
		const base = (n: DocNode) => getDefinition(`${n.definitionId}@${n.definitionVersion}`)
		const findings = templateLawFindings(doc, undefined, {
			describe: (n) =>
				n.key === 'secret'
					? { ...base(n)!, bands: { secretEntry: `${NS}:var/nobody@1` } }
					: base(n),
		})
		assert.equal(findings.length, 1)
		assert.match(
			findings[0]!.message,
			/band 'secretEntry' reaches 'speakPrompt' with variable 'fittest\.riddles:var\/nobody@1', which is not registered/,
		)
	})

	test('every shipped core spec: zero T1 findings with the checker', () => {
		let checked = 0
		for (const entry of CORE_SPECS) {
			const doc = entry.build()
			const t1 = validate(doc, { templates: checking }).filter((f) => f.law === 'T1')
			assert.deepEqual(t1, [], doc.id)
			checked++
		}
		assert.ok(checked > 0)
	})
})

// ── The packager's seed check ───────────────────────────────────────────────

describe("P5 · a plugin's template seeds", () => {
	const seed = (body: string): TemplateSeed => ({
		id: `${NS}:template/riddle-layout@1`,
		kind: 'template',
		nodeDefinitionId: 'core:task/assemble',
		engine: handlebars.id,
		body,
		label: 'Riddle layout',
	})

	test('a seed naming nothing in scope at a spec of the package is refused', () => {
		const doc = compile(riddleSpec())
		const found = templateSeedFindings([seed(TYPO)], [doc], checking)
		assert.equal(found.length, 1)
		assert.equal(found[0]!.template, `${NS}:template/riddle-layout@1`)
		assert.equal(found[0]!.nodeKey, 'speakPrompt')
		assert.match(
			found[0]!.message,
			/^'speakPrompt' can't render 'Riddle layout': it uses `secretEntri`/,
		)
	})

	test('a seed that fits is not refused', () => {
		const doc = compile(riddleSpec())
		assert.deepEqual(templateSeedFindings([seed(GOOD)], [doc], checking), [])
	})
})

describe('P5 · the packager refuses a template that does not fit', () => {
	const seed = (body: string): TemplateSeed => ({
		id: `${NS}:template/riddle-layout@1`,
		kind: 'template',
		nodeDefinitionId: 'core:task/assemble',
		engine: handlebars.id,
		body,
		label: 'Riddle layout',
	})
	const packaged = (preset: string, body: string) =>
		compilePlugin({
			sources: [
				{
					path: 'index.ts',
					text: `export default defineExtension({ slug: '${NS}' })\n.preset('riddles')\n'${NS}:template/riddle-layout@1'`,
				},
			],
			extension: defineExtension({
				slug: NS,
				name: 'Riddles',
				version: '1.0.0',
				pipelines: [riddleSpec(preset, `${NS}:spec/packaged`)],
				templates: [seed(body)],
			}),
		})

	test("a preset's template and a seed naming nothing in scope are both refused", () => {
		const r = packaged(TYPO, TYPO)
		assert.equal(r.ok, false)
		const scope = r.findings.filter((f) => f.code === 'E_TEMPLATE_SCOPE')
		assert.equal(scope.length, 2, renderFindings(r.findings))
		assert.match(
			scope[0]!.message,
			/can't render the 'riddles' preset's template: it uses `secretEntri`/,
		)
		assert.match(
			scope[1]!.message,
			/^template 'fittest\.riddles:template\/riddle-layout@1' at 'speakPrompt'/,
		)
		assert.equal(scope[1]!.fix, 'use "secretEntry"')
	})

	test('templates that fit package cleanly', () => {
		const r = packaged(GOOD, GOOD)
		assert.deepEqual(
			r.findings.filter((f) => f.code === 'E_TEMPLATE_SCOPE'),
			[],
		)
	})
})

// ── P6 · the annex in a template, and law T2 ────────────────────────────────

declareAnnex(NS, [
	annexField({
		key: 'secret',
		shape: { type: 'object', fields: { secretEntryName: { type: 'string' } } },
		see: ['ai'],
	}),
])

/** The engine-correct spelling of a dotted owner: a Handlebars segment literal. */
const ANNEX_REF = `{{annex.[${NS}].secret.secretEntryName}}`

describe('P6 · annex references in a template', () => {
	const t1 = (source: string, id: string, annex?: 'template') =>
		validate(compile(riddleSpec(source, `${NS}:spec/${id}`, annex)), { templates: checking }).filter(
			(f) => f.law === 'T1' || f.law === 'T2',
		)

	test('a declared key of an owner in scope fits, with the annex port wired', () => {
		assert.deepEqual(t1(`${GOOD}\n${ANNEX_REF}`, 'annex-ok', 'template'), [])
	})

	test('the same reference is refused when nothing feeds the annex port', () => {
		const f = t1(`${GOOD}\n${ANNEX_REF}`, 'annex-unwired')
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /it uses `annex\.fittest\.riddles\.secret\.secretEntryName`, which nothing supplies here/)
	})

	test('an undeclared (legacy) key is refused', () => {
		const f = t1(`${GOOD}\n{{annex.[${NS}].legacyNote}}`, 'annex-legacy', 'template')
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /legacyNote/)
	})

	test("an owner not in scope is refused — its keys never reach this template", () => {
		const f = t1(`${GOOD}\n{{annex.[someone.else].secret}}`, 'annex-other', 'template')
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /someone\.else/)
	})
})

describe('P6 · law T2 — one road into the annex port', () => {
	test("session-annex with view 'template' into Assemble's annex port: clean", () => {
		const doc = compile(riddleSpec(GOOD, `${NS}:spec/t2-ok`, 'template'))
		assert.deepEqual(annexPortFindings(doc), [])
		// Declared keys only, so not "the whole annex into a prompt" either.
		assert.deepEqual(
			validate(doc).filter((x) => x.law === 'R60'),
			[],
		)
	})

	test("a view other than 'template' is refused", () => {
		const doc = compile(riddleSpec(GOOD, `${NS}:spec/t2-ai`, 'ai'))
		const f = validate(doc).filter((x) => x.law === 'T2')
		assert.equal(f.length, 1)
		assert.equal(f[0]!.nodeKey, 'speakPrompt')
		assert.match(f[0]!.message, /whose view is not 'template'/)
	})

	test('anything but session-annex into the annex port is refused', () => {
		const doc = compile(riddleSpec(GOOD, `${NS}:spec/t2-cast`, 'cast'))
		const f = validate(doc).filter((x) => x.law === 'T2')
		assert.ok(f.some((x) => x.nodeKey === 'speakPrompt' && /fed by 'cast\.cast'/.test(x.message)))
	})

	test("a template-view read feeding anything but an annex port is refused", () => {
		const doc = compile(riddleSpec(GOOD, `${NS}:spec/t2-leak`, 'template'))
		const leaked = {
			...doc,
			edges: [...doc.edges, { from: 'annexRead', fromPort: 'main', to: 'rank', toPort: 'params' }],
		}
		const f = annexPortFindings(leaked)
		assert.equal(f.length, 1)
		assert.equal(f[0]!.nodeKey, 'annexRead')
		assert.match(f[0]!.message, /feeds 'rank\.params', which is not a template's 'annex' port/)
	})

	test('every shipped core spec: zero T2 findings', () => {
		for (const entry of CORE_SPECS) assert.deepEqual(annexPortFindings(entry.build()), [], entry.slug)
	})
})
