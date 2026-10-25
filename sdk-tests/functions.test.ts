/**
 * 🚧 Function modules (PLAN-rulesets-functions D1, 2026-10-23): the header
 * and its findings, the registry (idempotent), references and pins, forks,
 * what a function provides, and its forms as JSON Schema.
 *
 * Every refusal is a finding opened by its reason's name, so these tests
 * assert the reason, not the sentence.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	CHECK_METHOD_FUNCTIONS,
	CORE_CHECK_METHOD_KINDS,
	CORE_FUNCTION_IDS,
	CORE_FUNCTION_KINDS,
	checkMethodKindOfFunction,
	defineFunction,
	definePluginFunction,
	ATTRIBUTE_KINDS,
	attributeKindsInWords,
	attributeKindsOfSlotType,
	forkFunction,
	functionBindingFieldTypes,
	functionBindingKinds,
	functionFindings,
	functionHash,
	functionProvides,
	functionRefDecides,
	functionWayKeys,
	functionRefKey,
	functionRefKind,
	functions,
	getFunction,
	isReservedFunctionId,
	jsonSchemaOf,
	parseFunctionId,
	RESERVED_FUNCTIONS,
	resolveFunctionRef,
	NUMBER_ATTRIBUTE_KINDS,
	rulesetAttributeKinds,
	rulesetSectionFindings,
	RulesetError,
	validateAgainst,
	type FunctionProps,
	type FunctionRef,
} from '@serene-pub/sdk'

const reasons = (findings: readonly string[]): string[] => findings.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1] ?? f)
const has = (findings: readonly string[], reason: string) =>
	assert.ok(reasons(findings).includes(reason), `expected [${reason}] in:\n${findings.join('\n')}`)

const RESTORE: FunctionProps = {
	name: 'Restore a value',
	meaning: 'Brings a value back to its most.',
	kind: 'changing',
	bindings: { what: { to: 'attribute', label: 'Restore' } },
	prose: '{{what}} comes back to its most.',
	form: { to: { type: 'enum', of: ['max', 'start'], default: 'max', label: 'To' } },
	phases: ['effects'],
	body: 'export function effects(ctx) { return { deltas: [] } }',
}

describe('the header and its findings', () => {
	test('a header-only function, and a scripted one, are clean', () => {
		assert.deepEqual(functionFindings('acme.fn:function/restore@1', RESTORE), [])
		const judge = { name: 'Judge in words', meaning: 'The story decides.', kind: 'deciding' as const, prose: 'Decide it from the scene.' }
		assert.deepEqual(functionFindings('acme.fn:function/judge@1', judge), [])
		// A package's own kind is namespaced, so a typo refuses.
		assert.deepEqual(functionFindings('acme.fn:function/odd@1', { ...judge, kind: 'acme.fn:omen' }), [])
		has(functionFindings('acme.fn:function/odd@1', { ...judge, kind: 'omen' as never }), 'unknown-function-kind')
		assert.equal(CORE_FUNCTION_KINDS.length, 9)
	})

	test('each refusal is named', () => {
		const f = (over: Partial<FunctionProps>, id = 'acme.fn:function/f@1') => functionFindings(id, { ...RESTORE, ...over } as FunctionProps)
		has(functionFindings('restore', RESTORE), 'bad-function-id')
		has(f({ prose: ' ' }), 'missing-prose')
		has(f({ meaning: undefined as never }), 'display-text')
		has(f({ bindings: { what: { to: 'stat' as never } } }), 'bad-function-binding')
		has(f({ bindings: { what: { to: 'attribute', pick: 'yes' as never } } }), 'bad-function-binding')
		has(f({ bindings: { what: { to: 'attribute', tags: ['Not A Tag'] } } }), 'bad-tags')
		has(f({ phases: ['effects', 'whenever' as never] }), 'bad-phase')
		has(f({ phases: [] }), 'body-without-phases')
		has(f({ body: undefined }), 'phases-without-body')
		has(f({ body: 'x', seedKey: 'core:script/x' }), 'bad-body')
		has(f({ form: { to: { label: 'To' } as never } }), 'bad-form')
		has(f({ schema: { confessTo: {} as never } }), 'bad-schema')
		has(f({ emits: ['confession-accepted'] }), 'bad-emits')
		has(f({ invokable: { label: undefined as never } }), 'display-text')
		has(f({ adds: { attributes: [{ id: 'Nerve', kind: 'pool', prose: 'p' }] } }), 'bad-attribute')
		has(f({ adds: { events: [{ id: 'nope', name: 'Nope' }] } }), 'bad-adds')
		has(f({ rollsDice: true }), 'bad-chance')
		has(f({ forkedFrom: 'restore' }), 'bad-fork')
		// A reserved core id declared as another kind.
		has(f({}, CORE_FUNCTION_IDS.dieTarget), 'reserved-kind')
	})

	test('display text is not content; what the model reads is', () => {
		const a = { ...RESTORE, id: 'acme.fn:function/h@1' }
		assert.equal(functionHash(a), functionHash({ ...a, meaning: 'Another sentence a person reads.', name: a.name }))
		assert.notEqual(functionHash(a), functionHash({ ...a, prose: 'Something else the model reads.' }))
		assert.notEqual(functionHash(a), functionHash({ ...a, body: 'export function effects() { return {} }' }))
	})
})

describe('the registry', () => {
	test('declared once; an identical redeclaration is a no-op; a different one throws; core is reserved', () => {
		const decl = definePluginFunction('acme.fn', 'acme.fn:function/restore@1', RESTORE)
		assert.equal(getFunction(decl.id), decl)
		assert.ok(functions().includes(decl))
		assert.ok(Object.isFrozen(decl) && Object.isFrozen(decl.bindings))
		assert.equal(definePluginFunction('acme.fn', decl.id, { ...RESTORE, meaning: 'Reworded.' }), decl)
		assert.throws(() => definePluginFunction('acme.fn', decl.id, { ...RESTORE, prose: 'Other.' }), /duplicate function id/)
		assert.throws(() => definePluginFunction('acme.fn', 'core:function/mine@1', RESTORE), /reserved/)
		assert.throws(() => defineFunction('acme.fn:function/bad@1', { ...RESTORE, prose: '' }), (e: unknown) => e instanceof RulesetError)
		assert.deepEqual(parseFunctionId(decl.id), { owner: 'acme.fn', name: 'restore', version: 1 })
	})

	test('core reserves its catalogue ids: every check method kind is a deciding function', () => {
		for (const k of CORE_CHECK_METHOD_KINDS) {
			const id = CHECK_METHOD_FUNCTIONS[k]
			assert.ok(isReservedFunctionId(id), id)
			assert.equal(RESERVED_FUNCTIONS[id]!.kind, 'deciding')
			assert.equal(checkMethodKindOfFunction(id), k)
		}
		assert.equal(CHECK_METHOD_FUNCTIONS.bid, CORE_FUNCTION_IDS.spend)
		assert.equal(CHECK_METHOD_FUNCTIONS.none, CORE_FUNCTION_IDS.judge)
		for (const id of Object.values(CORE_FUNCTION_IDS)) assert.ok(isReservedFunctionId(id), id)
	})
})

describe('references, pins and forks', () => {
	test('a reference resolves to a registered, reserved or carried module — or says why not', () => {
		const reg = resolveFunctionRef({ ref: 'acme.fn:function/restore@1' })
		assert.equal(reg.decl?.id, 'acme.fn:function/restore@1')
		assert.equal(reg.key, 'restore')
		assert.deepEqual(reg.findings, [])
		const reserved = resolveFunctionRef({ ref: CORE_FUNCTION_IDS.dicePool, key: 'pool' })
		assert.equal(reserved.decl, undefined)
		assert.equal(reserved.reserved?.methodKind, 'dice-pool')
		assert.deepEqual(reserved.findings, [])
		has(resolveFunctionRef({ ref: 'acme.fn:function/ghost@1' }).findings, 'unknown-function')
		has(resolveFunctionRef({ ref: 'ghost' } as FunctionRef).findings, 'bad-function-ref')
		const decl = getFunction('acme.fn:function/restore@1')!
		assert.deepEqual(resolveFunctionRef({ ref: decl.id, hash: functionHash(decl) }).findings, [])
		has(resolveFunctionRef({ ref: decl.id, hash: 'deadbeef' }).findings, 'function-hash-moved')
		assert.equal(functionRefKey({ ref: decl.id, key: 'morning' }), 'morning')
		assert.equal(functionRefKind({ ref: CORE_FUNCTION_IDS.samePlace }), 'scope')
	})

	test('a fork is a copy under the ruleset, marked forkedFrom, carried by reference', () => {
		const decl = getFunction('acme.fn:function/restore@1')!
		const fork = forkFunction(decl, 'jody:ruleset/hollow-hearts@1')
		assert.equal(fork.id, 'jody:function/hollow-hearts-restore@1')
		assert.equal(fork.forkedFrom, decl.id)
		assert.equal(fork.prose, decl.prose)
		assert.equal(getFunction(fork.id), undefined, 'a fork registers nothing')
		const carried = resolveFunctionRef({ ref: fork.id, module: { ...fork, body: 'export function effects() { return { deltas: [] } }' } })
		assert.equal(carried.decl?.forkedFrom, decl.id)
		has(resolveFunctionRef({ ref: decl.id, module: fork }).findings, 'module-not-ref')
		assert.throws(() => forkFunction(decl, 'not a ruleset'), /not a ruleset id/)
	})

	test('what a function provides, and whether it decides', () => {
		const p = functionProvides(getFunction('acme.fn:function/restore@1')!)
		assert.equal(p.kind, 'changing')
		assert.equal(p.decides, false)
		assert.deepEqual(p.phases, ['effects'])
		const die = functionProvides(CORE_FUNCTION_IDS.dieTarget)
		assert.deepEqual([die.kind, die.decides, die.chance, die.rollsDice], ['deciding', true, true, true])
		assert.equal(functionProvides(CORE_FUNCTION_IDS.judge).decides, false)
		assert.equal(functionProvides(CORE_FUNCTION_IDS.check).decides, false)
		const confess = defineFunction('acme.fn:function/confess@1', {
			name: 'A confession',
			meaning: 'Compare a value against a target.',
			kind: 'deciding',
			bindings: { feeling: { to: 'attribute', pick: true }, whom: { to: 'scope' } },
			adds: { events: [{ id: 'acme.fn:event/confession-accepted@1', name: 'Confession accepted' }], verbs: ['confess'], outcomes: [{ id: 'warmed', label: 'Warmed', five: 'success' }] },
			prose: 'A confession is met when {{feeling}} reaches the target.',
			emits: ['acme.fn:event/confession-accepted@1'],
			invokable: { label: 'Confess', form: { to: { type: 'string', label: 'To whom' } } },
			schema: { confessTo: { type: 'string', label: 'Who they confess to' } },
			form: { target: { type: 'integer', min: 0, max: 10, default: 7, label: 'Target' } },
			phases: ['before'],
			body: 'export function before(ctx) { return {} }\nexport function decide(ctx) { return {} }',
		})
		const c = functionProvides(confess)
		assert.deepEqual([c.decides, c.invokable, c.verbs, c.events, c.outcomes], [true, true, ['confess'], ['acme.fn:event/confession-accepted@1'], ['warmed']])
		assert.equal(functionRefDecides({ ref: confess.id }), true)
		// A deciding function that only shapes a decision (an edge) is no way by itself — unless a check names it as its way.
		const edge = { id: 'acme.fn:function/edge@1', name: 'An edge', meaning: 'Roll twice, keep the better.', kind: 'deciding', prose: 'With an edge, roll twice.', phases: ['before'], body: 'export function before(ctx) { return {} }' } as const
		assert.equal(functionRefDecides({ ref: edge.id, key: 'edge', module: edge }), false)
		assert.equal(functionRefDecides({ ref: edge.id, key: 'edge', module: edge }, new Set(['edge'])), true)
		assert.deepEqual([...functionWayKeys([{ ref: CORE_FUNCTION_IDS.check, key: 'dare', options: { way: 'edge' } }, { ref: edge.id, key: 'edge' }])], ['edge'])
	})
})

describe('forms as JSON Schema', () => {
	test("its options, its reply fields, and the action's form", () => {
		const confess = getFunction('acme.fn:function/confess@1')!
		assert.deepEqual(Object.keys((jsonSchemaOf(confess) as { properties: object }).properties), ['target'])
		assert.deepEqual(Object.keys((jsonSchemaOf(confess, { part: 'schema' }) as { properties: object }).properties), ['confessTo'])
		assert.deepEqual(Object.keys((jsonSchemaOf(confess, { part: 'invokable' }) as { properties: object }).properties), ['to'])
		// No form of its own: an action asks the function's options.
		const restore = getFunction('acme.fn:function/restore@1')!
		assert.deepEqual(jsonSchemaOf(restore, { part: 'invokable' }), jsonSchemaOf(restore))
		assert.deepEqual(validateAgainst(confess, { target: 7 }), [])
		assert.ok(validateAgainst(confess, { target: 99 }).length)
		assert.ok(validateAgainst(confess, { who: 'Mara' }, { part: 'invokable' }).length)
	})
})

describe('references in a ruleset', () => {
	const base = {
		name: 'Bindings',
		attributes: [
			{ id: 'nerve', name: 'Nerve', kind: 'pool' as const, bounds: { max: 3 }, tags: ['resource'], prose: 'Spent to do something brave.' },
			{ id: 'affection', name: 'Affection', kind: 'number' as const, bounds: { min: 0, max: 10 }, prose: 'How much someone likes you.' },
		],
	}
	const f = (refs: readonly FunctionRef[]) => rulesetSectionFindings('acme.fn:ruleset/b@1', { ...base, functions: refs })

	test('bound, by tag, by pick — or refused by name', () => {
		assert.deepEqual(f([{ ref: 'acme.fn:function/restore@1', bindings: { what: 'nerve' } }]), [])
		has(f([{ ref: 'acme.fn:function/restore@1' }]), 'unbound-function-binding')
		has(f([{ ref: 'acme.fn:function/restore@1', bindings: { what: 'grace' } }]), 'bad-function-binding')
		has(f([{ ref: 'acme.fn:function/restore@1', bindings: { what: ['nerve', 'affection'] } }]), 'bad-function-binding')
		has(f([{ ref: 'acme.fn:function/restore@1', bindings: { what: 'nerve', whom: 'everyone' } }]), 'unknown-function-binding')
		has(f([{ ref: 'acme.fn:function/restore@1', bindings: { what: 'nerve' }, options: { to: 'never' } }]), 'bad-function-options')
		has(f([{ ref: 'acme.fn:function/restore@1', bindings: { what: 'nerve' }, options: { colour: 'red' } }]), 'bad-function-options')
		// A pick and a scope: bound when used; the scope a word or a scope function.
		assert.deepEqual(f([{ ref: 'acme.fn:function/confess@1', bindings: { whom: CORE_FUNCTION_IDS.samePlace } }]), [])
		has(f([{ ref: 'acme.fn:function/confess@1', bindings: { whom: CORE_FUNCTION_IDS.dieTarget } }]), 'bad-visibility')
		has(f([{ ref: 'acme.fn:function/confess@1' }]), 'unbound-function-binding')
		// Two uses need two keys; a key is not an attribute's name.
		has(f([{ ref: CORE_FUNCTION_IDS.dieTarget, key: 'd20' }, { ref: CORE_FUNCTION_IDS.dicePool, key: 'd20' }]), 'duplicate-function-key')
		has(f([{ ref: CORE_FUNCTION_IDS.tally, key: 'nerve' }]), 'name-taken')
		has(f([{ ref: 'acme.fn:function/ghost@1' }]), 'unknown-function')
	})

	test('a tag binding resolves by tag; an emitted event is declared somewhere', () => {
		definePluginFunction('acme.fn', 'acme.fn:function/refill@1', {
			...RESTORE,
			bindings: { what: { to: 'attribute', tags: ['resource'] } },
			emits: ['acme.fn:event/refilled@1'],
		})
		has(f([{ ref: 'acme.fn:function/refill@1' }]), 'unknown-event')
		const adder: FunctionRef = {
			ref: 'acme.fn:function/announcer@1',
			module: {
				id: 'acme.fn:function/announcer@1',
				name: 'Announcer',
				meaning: 'Declares the event.',
				kind: 'time',
				adds: { events: [{ id: 'acme.fn:event/refilled@1', name: 'Refilled' }] },
				prose: 'Mornings come.',
			},
		}
		assert.deepEqual(f([{ ref: 'acme.fn:function/refill@1' }, adder]), [])
	})
})

describe('🚧 typed function bindings (RF fix 6, 2026-10-23)', () => {
	const f = (bindings: FunctionProps['bindings']) => functionFindings('acme.typed:function/x@1', { ...RESTORE, bindings })

	test('a role says the attribute kinds it takes, and the entry field types; a bad list is refused', () => {
		assert.deepEqual(f({ what: { to: 'attribute', kinds: NUMBER_ATTRIBUTE_KINDS } }), [])
		assert.deepEqual(f({ what: { to: 'attribute', kinds: ['label', 'text'], entryFields: ['string', 'enum'] } }), [])
		assert.deepEqual(f({ what: { to: 'attribute', kinds: ['number'], entryFields: true } }), [])
		has(f({ what: { to: 'attribute', kinds: ['mood' as never] } }), 'bad-function-binding')
		has(f({ what: { to: 'attribute', kinds: [] } }), 'bad-function-binding')
		has(f({ what: { to: 'attribute', kinds: ['number', 'number'] } }), 'bad-function-binding')
		has(f({ what: { to: 'entry-type', kinds: ['number'] } }), 'bad-function-binding')
		has(f({ what: { to: 'attribute', entryFields: ['secret'] } }), 'bad-function-binding')
		has(f({ what: { to: 'attribute', entryFields: 'yes' as never } }), 'bad-function-binding')
		has(f({ what: { to: 'entry-type', entryFields: ['string'] } }), 'bad-function-binding')
	})

	test('what a role takes when it says nothing, and in words', () => {
		assert.deepEqual(functionBindingKinds({ to: 'attribute' }), ATTRIBUTE_KINDS)
		assert.deepEqual(functionBindingKinds({ to: 'attribute', kinds: ['tally'] }), ['tally'])
		assert.deepEqual(functionBindingKinds({ to: 'entry-type' }), [])
		assert.deepEqual(functionBindingFieldTypes({ to: 'attribute', entryFields: true }), ['number', 'integer'])
		assert.deepEqual(functionBindingFieldTypes({ to: 'attribute', entryFields: ['enum'] }), ['enum'])
		assert.deepEqual(functionBindingFieldTypes({ to: 'attribute' }), [])
		assert.equal(attributeKindsInWords(NUMBER_ATTRIBUTE_KINDS), 'a number, a pool or a tally')
		assert.equal(attributeKindsInWords(['label', 'text']), 'a word or free text')
		assert.equal(attributeKindsInWords(['text']), 'free text')
		assert.equal(attributeKindsInWords(ATTRIBUTE_KINDS), 'any kind of attribute')
		// An attribute's own kind; one that names a slot nobody registered is never judged by kind.
		assert.deepEqual(rulesetAttributeKinds({ kind: 'pool' }), ['pool'])
		assert.equal(rulesetAttributeKinds({ slot: 'acme.typed:slot/nowhere@1' }), undefined)
		// A borrowed attribute is read by its slot's type.
		assert.deepEqual(attributeKindsOfSlotType('integer'), NUMBER_ATTRIBUTE_KINDS)
		assert.deepEqual(attributeKindsOfSlotType('text'), ['label', 'text'])
		assert.equal(attributeKindsOfSlotType('secret'), undefined)
	})

	test('a ruleset binding a role to an attribute or a field of another kind is refused, by name', () => {
		definePluginFunction('acme.typed', 'acme.typed:function/add-up@1', {
			...RESTORE,
			name: 'Add up',
			bindings: { what: { to: 'attribute', kinds: NUMBER_ATTRIBUTE_KINDS, entryFields: true, label: 'The number' } },
		})
		definePluginFunction('acme.typed', 'acme.typed:function/say@1', {
			...RESTORE,
			name: 'Say',
			bindings: { what: { to: 'attribute', kinds: ['label', 'text'], entryFields: ['string', 'enum'], label: 'The word' } },
		})
		const doc = (ref: string, what: string) =>
			rulesetSectionFindings('acme.typed:ruleset/t@1', {
				name: 'Typed',
				attributes: [
					{ id: 'nerve', name: 'Nerve', kind: 'pool', bounds: { max: 3 }, prose: 'Spent to do something brave.' },
					{ id: 'mood', name: 'Mood', kind: 'text', prose: 'How someone is, in their own words.' },
					{ id: 'aside', name: 'Aside', slot: 'acme.typed:slot/nowhere@1', borrowed: true },
				],
				entryTypes: [
					{
						id: 'bond',
						name: 'Bond',
						prose: 'Two people and how they stand.',
						fields: { affection: { type: 'integer', label: 'Affection' }, note: { type: 'string', label: 'Note' } },
					},
				],
				functions: [{ ref, key: 'use', bindings: { what } }],
			}).filter((x) => !x.includes('[unknown-attribute-slot]') && !x.includes('acme.typed:slot/nowhere'))
		assert.deepEqual(doc('acme.typed:function/add-up@1', 'nerve'), [])
		assert.deepEqual(doc('acme.typed:function/add-up@1', 'bond.affection'), [])
		assert.deepEqual(doc('acme.typed:function/say@1', 'mood'), [])
		assert.deepEqual(doc('acme.typed:function/say@1', 'bond.note'), [])
		const text = doc('acme.typed:function/add-up@1', 'mood')
		has(text, 'bad-binding-kind')
		// The sentence names the role, the attribute and the kinds it takes.
		assert.match(text.join('\n'), /Add up's 'The number' takes a number, a pool or a tally; 'mood' is free text\./)
		has(doc('acme.typed:function/add-up@1', 'bond.note'), 'bad-binding-kind')
		has(doc('acme.typed:function/say@1', 'nerve'), 'bad-binding-kind')
		has(doc('acme.typed:function/say@1', 'bond.affection'), 'bad-binding-kind')
		// Nothing the ruleset has is still the binding's own refusal.
		has(doc('acme.typed:function/add-up@1', 'grace'), 'bad-function-binding')
		// An attribute whose kind cannot be said (an unregistered slot) is not judged by kind.
		assert.ok(!reasons(doc('acme.typed:function/add-up@1', 'aside')).includes('bad-binding-kind'))
	})
})

describe('🚧 option roles (RF fix 8 — RF fix 6 ★2/★3)', () => {
	definePluginFunction('acme.roles', 'acme.roles:function/weigh@1', {
		name: 'Weigh',
		meaning: 'Reads a value and names a way.',
		kind: 'deciding',
		prose: 'A value is weighed by one of the ways.',
		form: {
			base: { type: 'string', label: 'Reads' },
			resource: { type: 'string', label: 'Spends from' },
			way: { type: 'string', label: 'Decided by' },
		},
		optionRoles: { base: { names: 'value' }, resource: { names: 'value', kinds: ['pool'] }, way: { names: 'function' } },
	})
	const doc = (options: Record<string, string>) =>
		rulesetSectionFindings('acme.roles:ruleset/r@1', {
			name: 'Roles',
			attributes: [
				{ id: 'nerve', name: 'Nerve', kind: 'pool', bounds: { max: 3 }, prose: 'Spent to do something brave.' },
				{ id: 'grit', name: 'Grit', kind: 'number', prose: 'How hard they are to stop.' },
				{ id: 'vow', name: 'Vow', kind: 'text', prose: 'What they swore, in their own words.' },
			],
			entryTypes: [{ id: 'bond', name: 'Bond', prose: 'Two people.', fields: { warmth: { type: 'integer', label: 'Warmth' }, note: { type: 'string', label: 'Note' } } }],
			functions: [
				{ ref: CORE_FUNCTION_IDS.judge, key: 'judged' },
				{ ref: 'acme.roles:function/weigh@1', key: 'weigh', options },
			],
		})
	test('the header says which options name what; a role on an option the form lacks is refused', () => {
		has(functionFindings('acme.roles:function/bad@1', { ...RESTORE, optionRoles: { nowhere: { names: 'value' } } } as never), 'bad-function-options')
		has(functionFindings('acme.roles:function/bad@1', { ...RESTORE, form: { to: RESTORE.form!.to! }, optionRoles: { to: { names: 'word' } } } as never), 'bad-function-options')
		assert.deepEqual(getFunction('acme.roles:function/weigh@1')?.optionRoles?.way, { names: 'function' })
	})
	test('a value an option reads is a number — never a word or free text where it is counted', () => {
		assert.deepEqual(doc({ base: 'grit', resource: 'nerve', way: 'judged' }), [])
		assert.deepEqual(doc({ base: 'bond.warmth' }), [])
		const text = doc({ base: 'vow' })
		has(text, 'bad-binding-kind')
		assert.match(text.join('\n'), /Weigh's 'Reads' takes a number, a pool or a tally; 'vow' is free text\./)
		has(doc({ base: 'bond.note' }), 'bad-binding-kind')
		// A role's own kinds: a spend takes a pool, not a plain number.
		has(doc({ resource: 'grit' }), 'bad-binding-kind')
	})
	test('an option naming a function names one of the ruleset\'s — a pasted Document can carry one that names nothing', () => {
		const found = doc({ way: 'nope' })
		has(found, 'unknown-way')
		assert.match(found.join('\n'), /Weigh's 'Decided by' names 'nope', which is none of the ruleset's functions \(judged, weigh\)\./)
	})
})

