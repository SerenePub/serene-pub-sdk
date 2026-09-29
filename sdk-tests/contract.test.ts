/**
 * A definition's contract and its policy (plans/31 V6, ruled 2026-09-17).
 *
 * A node definition's content hash covers its **contract** — what a pinned
 * spec runs against — and nothing else. Everything else on a `Descriptor` is
 * **policy**: what is offered or shown, stored on the registry row and never
 * hashed. The rule in one line: *what is offered is policy; what runs is
 * contract.*
 *
 * The classification below names every `Descriptor` field with its half and
 * the one-line reason. It is a `satisfies Record<keyof Descriptor, …>`, so a
 * field added to the interface and not to this table stops this file
 * compiling — the same guard `DESCRIPTOR_FIELDS_CLASSIFIED` puts in the SDK
 * itself — and the first test holds the table to the SDK's two exported lists
 * in both directions.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	DESCRIPTOR_CONTRACT_KEYS,
	DESCRIPTOR_POLICY_KEYS,
	definitionContract,
	definitionContractHash,
	definitionPolicy,
	snapshotRegistry,
	allDefinitions,
	describeOracleDefinition,
	getDefinition,
	varHistory,
	varWorldLore,
	S,
	type Descriptor,
	type RegistryEntry,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import './fixtures.js'

type Half = 'contract' | 'policy'

/** Every `Descriptor` field, its half, and why — the ruling as a table. */
const CLASSIFICATION = {
	id: ['contract', 'the slug a pin names; the version rides in it'],
	kind: ['contract', 'inlet · query · task · oracle · outlet · entry — what the executor does with the node'],
	ports: ['contract', 'the shapes a document was compiled against, both directions'],
	slots: ['contract', 'the configurable surface and its schema — a moved default changes what an untouched spec does'],
	effects: ['contract', 'what the gate keys on and what the run is allowed to do here'],
	review: ['contract', 'the fields a reviewer’s decision is validated against'],
	shape: ['contract', 'the connection kind a provider produces — what a connection slot may hold'],
	optional: ['contract', 'whether failing is tolerated — the run’s behaviour on error'],
	declaresRandomness: ['contract', 'which nodes draw on the seed — a replay is only a replay while that set holds'],
	scriptPoints: ['contract', 'the interior points a spec’s chains may attach to, and what each accepts'],
	sessionShape: ['contract', 'what sessions of the mode legally contain'],
	earlyExit: ['contract', 'whether a stream consumer may return before the stream ends'],
	causesEvent: ['contract', 'which core event the write fires — what downstream subscribes to'],
	causesEventFrom: ['contract', 'the in-port whose literal names the event a recording causes'],
	payloads: ['contract', 'the event payloads an inlet reads — which events one lock may list (R33)'],
	liveRow: ['contract', 'which outlet’s row the stream lands in'],
	media: ['contract', 'what a document may wire into the media ports — the bind-time refusal’s input'],
	entryShape: ['contract', 'the entry row’s roles, render, source kind and fields schema'],
	i18n: ['policy', 'what the node is called — display text'],
	reviewDefault: ['policy', 'where the gate starts — offered to whoever configures the node'],
	toggleable: ['policy', 'whether the panel offers a switch — the node runs the same either side of it'],
	provisional: ['policy', 'whether the definition is offered at all — declared, not bound'],
	public: ['policy', 'who may pin it — decided at install, not at run'],
	timeoutMs: ['policy', 'how long the host waits — the host’s to tune'],
	timeoutKind: ['policy', 'wall or idle — the same tuning, one axis over'],
	usage: ['policy', 'where a receipt reads token usage — changes what is reported, never what is produced'],
	bands: ['contract', 'which top-level template names a source publishes, and through which variable — what a template may reference (owner ruling 2026-09-27)'],
	bandPorts: ['contract', 'which out-ports carry a declared band — whether a band reaches a template at all (2026-09-27)'],
	portSchemas: ['contract', 'what an out-port payload holds, which is what a template reading it may reference (owner ruling 2026-09-27)'],
} as const satisfies Record<keyof Descriptor, readonly [Half, string]>

const keysOf = (half: Half): string[] =>
	Object.entries(CLASSIFICATION)
		.filter(([, [h]]) => h === half)
		.map(([k]) => k)
		.sort()

const TEXT = 'core:shape/text@1'
const JSON_SHAPE = 'core:shape/json@1'

/** A gated oracle with every policy field set, so each one can be moved in turn. */
const base = describeOracleDefinition({
	id: 'test:oracle/contract-probe@1',
	i18n: { name: { en: 'Probe' } },
	effects: 'external',
	review: { fields: ['text'] },
	reviewDefault: 'off',
	timeoutMs: 1000,
	timeoutKind: 'wall',
	toggleable: false,
	public: false,
	usage: 'response.usage',
	ports: { in: { text: TEXT }, out: { main: JSON_SHAPE } },
	slots: {
		params: {
			kind: 'parameters',
			schema: { topK: { type: 'integer', default: 5, max: 50, label: 'Top K' } },
		},
	},
})

const moved = (patch: Partial<Descriptor>): string =>
	definitionContractHash({ ...(base as Descriptor), ...patch })

describe('V6 · every Descriptor field is contract or policy, and the SDK says which', () => {
	test('the table agrees with DESCRIPTOR_CONTRACT_KEYS and DESCRIPTOR_POLICY_KEYS, both ways', () => {
		assert.deepEqual([...DESCRIPTOR_CONTRACT_KEYS].sort(), keysOf('contract'))
		assert.deepEqual([...DESCRIPTOR_POLICY_KEYS].sort(), keysOf('policy'))
		// Exactly one half each: the two lists are disjoint and together cover the table.
		const both = DESCRIPTOR_CONTRACT_KEYS.filter((k) => (DESCRIPTOR_POLICY_KEYS as readonly string[]).includes(k))
		assert.deepEqual(both, [])
		assert.equal(
			DESCRIPTOR_CONTRACT_KEYS.length + DESCRIPTOR_POLICY_KEYS.length,
			Object.keys(CLASSIFICATION).length,
		)
	})

	test('the material carries the contract keys and no policy key', () => {
		const material = definitionContract(base as Descriptor) as unknown as Record<string, unknown>
		const present = Object.keys(material).filter((k) => material[k] !== undefined)
		for (const k of present)
			assert.ok(
				(DESCRIPTOR_CONTRACT_KEYS as readonly string[]).includes(k) || k === 'version' || k === 'semantics',
				`\`${k}\` is in the hashed material and is not a contract key`,
			)
		for (const k of DESCRIPTOR_POLICY_KEYS) assert.ok(!(k in material), `policy key \`${k}\` reached the material`)
		// The slug's two halves, split: the id is bare and the version is a number.
		assert.equal(material.id, 'test:oracle/contract-probe')
		assert.equal(material.version, 1)
	})
})

describe('V6 · policy moves no hash', () => {
	const before = definitionContractHash(base as Descriptor)

	test('provisional: true — toggled on, and off a shipped definition', () => {
		assert.equal(moved({ provisional: true }), before)
		// The three core definitions that carry the flag today: dropping it
		// moves nothing, which is the whole reversal of U6's choice.
		for (const id of ['core:oracle/speak@1', 'core:oracle/mcp-tool@1', 'core:oracle/mcp-resource@1']) {
			const d = getDefinition(id)!
			assert.equal(d.provisional, true, id)
			const { provisional: _p, ...bound } = d
			assert.equal(definitionContractHash(bound), definitionContractHash(d), id)
		}
	})

	test('timeoutMs · timeoutKind · reviewDefault · toggleable · public · usage · i18n', () => {
		assert.equal(moved({ timeoutMs: 99_000 }), before)
		assert.equal(moved({ timeoutKind: 'idle' }), before)
		assert.equal(moved({ reviewDefault: 'on' }), before)
		assert.equal(moved({ toggleable: true }), before)
		assert.equal(moved({ public: true }), before)
		assert.equal(moved({ usage: 'elsewhere.usage' }), before)
		assert.equal(moved({ i18n: { name: { en: 'Renamed' }, description: { en: 'reworded' } } }), before)
	})

	test('display text inside a slot is policy too — a relabelled parameter moves nothing; its range does', () => {
		const params = base.slots!.params
		const relabelled = {
			params: {
				...params,
				schema: { topK: { ...params.schema.topK, label: 'Wie viele', description: { en: 'anders' } } },
			},
		}
		assert.equal(moved({ slots: relabelled }), before)
		const widened = { params: { ...params, schema: { topK: { ...params.schema.topK, max: 999 } } } }
		assert.notEqual(moved({ slots: widened }), before)
	})
})

describe('V6 · contract moves the hash', () => {
	const before = definitionContractHash(base as Descriptor)

	test('a port added', () => {
		assert.notEqual(moved({ ports: { in: { text: TEXT, more: TEXT }, out: { main: JSON_SHAPE } } }), before)
	})

	test('review.fields changed — narrowed to nothing, and widened', () => {
		assert.notEqual(moved({ review: { fields: [] } }), before)
		assert.notEqual(moved({ review: { fields: ['text', 'title'] } }), before)
		// And the declaration going away entirely: an inferred form is a different contract.
		assert.notEqual(moved({ review: undefined }), before)
	})

	test('each remaining contract flag and declaration', () => {
		assert.notEqual(moved({ optional: true }), before)
		assert.notEqual(moved({ declaresRandomness: true }), before)
		assert.notEqual(moved({ earlyExit: true }), before)
		assert.notEqual(moved({ liveRow: true }), before)
		assert.notEqual(moved({ effects: 'write' }), before)
		assert.notEqual(moved({ causesEvent: 'core:event/message-created@1' }), before)
		assert.notEqual(moved({ shape: S.textGen }), before)
		assert.notEqual(moved({ media: { accepts: ['image'] } }), before)
		assert.notEqual(moved({ kind: 'outlet' }), before)
	})

	test('a boolean flag spelled `false` is the flag absent — one contract, one hash', () => {
		// The row's `NOT NULL DEFAULT false` columns read a never-declared flag
		// back as `false`; the material normalises both spellings to absence.
		assert.equal(moved({ optional: false, earlyExit: false, liveRow: false, declaresRandomness: false }), before)
	})
})

describe('bands and portSchemas are contract (owner ruling 2026-09-27)', () => {
	// They decide what a template may reference, so a plugin update that
	// changes which bands a step produces (or what a port's payload holds)
	// must move the hash — and the same declaration must not.
	const before = definitionContractHash(base as Descriptor)

	test('changing the declared bands changes the hash; the same bands give the same hash', () => {
		const one = moved({ bands: { worldLore: varWorldLore } })
		assert.notEqual(one, before)
		assert.equal(moved({ bands: { worldLore: varWorldLore } }), one)
		const two = moved({ bands: { worldLore: varWorldLore, history: varHistory } })
		assert.notEqual(two, one)
		// A set by key: the order the author wrote them in is not contract.
		assert.equal(moved({ bands: { history: varHistory, worldLore: varWorldLore } }), two)
		// Same key, another variable — a different layout for the same name.
		assert.notEqual(moved({ bands: { worldLore: varHistory } }), one)
		// No bands and an empty map are one contract.
		assert.equal(moved({ bands: {} }), before)
	})

	test('changing which ports carry a band changes the hash; port order is not contract', () => {
		const bands = { worldLore: varWorldLore }
		const whole = moved({ bands })
		const one = moved({ bands, bandPorts: { worldLore: ['main'] } })
		assert.notEqual(one, whole)
		assert.equal(moved({ bands, bandPorts: { worldLore: ['main'] } }), one)
		assert.notEqual(moved({ bands, bandPorts: { worldLore: ['hits'] } }), one)
		assert.equal(
			moved({ bands, bandPorts: { worldLore: ['main', 'hits'] } }),
			moved({ bands, bandPorts: { worldLore: ['hits', 'main'] } }),
		)
		// None and an empty map are one contract.
		assert.equal(moved({ bands, bandPorts: {} }), whole)
	})

	test('a row hashes its policy-borne bandPorts to the descriptor’s hash', () => {
		const d = {
			...(base as Descriptor),
			bands: { worldLore: varWorldLore },
			bandPorts: { worldLore: ['main'] },
		}
		const [row] = snapshotRegistry([d as Descriptor], { release: 'test' })
		assert.deepEqual(row!.policy?.bandPorts, { worldLore: ['main'] })
		assert.equal(definitionContractHash(row!), definitionContractHash(d as Descriptor))
	})

	test('changing a port schema changes the hash; the same schema gives the same hash', () => {
		const a = moved({ portSchemas: { out: { main: { type: 'string' } } } })
		assert.notEqual(a, before)
		assert.equal(moved({ portSchemas: { out: { main: { type: 'string' } } } }), a)
		assert.notEqual(moved({ portSchemas: { out: { main: { type: 'number' } } } }), a)
	})

	test('a row hashes its policy-borne bands and port schemas to the descriptor’s hash', () => {
		const d = { ...(base as Descriptor), bands: { worldLore: varWorldLore }, portSchemas: { out: { main: { type: 'string' as const } } } }
		const [row] = snapshotRegistry([d as Descriptor], { release: 'test' })
		// Still read from the row's policy, where the panel reads them.
		assert.deepEqual(row!.policy?.bands, { worldLore: varWorldLore.id })
		assert.deepEqual(row!.policy?.portSchemas, d.portSchemas)
		assert.equal(definitionContractHash(row!), definitionContractHash(d as Descriptor))
		assert.notEqual(definitionContractHash(row!), before)
	})
})

describe('V6 · one material from either end of the table', () => {
	test('every shipped definition hashes the same as its registry projection', () => {
		for (const d of allDefinitions()) {
			const [row] = snapshotRegistry([d], { release: 'test' })
			assert.equal(definitionContractHash(row!), definitionContractHash(d), d.id)
		}
	})

	test('the substrate’s settings slot rides on the row and stays out of the hash', () => {
		const [row] = snapshotRegistry([C.generateText.descriptor], { release: 'test' })
		assert.ok('settings' in row!.slots, 'a gated definition’s row carries the settings slot')
		const { settings: _s, ...authored } = row!.slots
		assert.equal(definitionContractHash({ ...row!, slots: authored }), definitionContractHash(row!))
	})

	test('the row carries the policy half, whole, and the contract fields that had no column', () => {
		const [row] = snapshotRegistry([base], { release: 'test' })
		assert.deepEqual(row!.policy, {
			reviewDefault: 'off',
			timeoutMs: 1000,
			timeoutKind: 'wall',
			toggleable: false,
		})
		assert.deepEqual(definitionPolicy(C.speak.descriptor).provisional, true)
		assert.deepEqual(row!.review, { fields: ['text'] })
		const [placeholder] = snapshotRegistry([C.createMessage.descriptor], { release: 'test' })
		assert.equal(placeholder!.liveRow, true)
		const [provider] = snapshotRegistry([C.generateText.descriptor], { release: 'test' })
		assert.equal(provider!.shape, S.textGen)
		assert.ok(provider!.media?.accepts?.length, 'generate-text declares media')
		// And a row's policy is never in its material.
		const material = definitionContract(row as RegistryEntry) as unknown as Record<string, unknown>
		assert.ok(!('policy' in material))
	})
})
