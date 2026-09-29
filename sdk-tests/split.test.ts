/**
 * Use cases 104–106 — the rulings taken on 13 §10.
 *
 * 104 · `commitMessage` split into `createMessage` / `updateMessage` (§10b)
 * 105 · a gate-eligible write publishes `write-result@1`, checked at registration
 * 106 · the legacy split migration: recovered where recoverable, reported where not
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	spec,
	slot,
	describeOutletDefinition,
	S,
	splitCommitMessage,
	unmappedEntries,
	assertReportComplete,
	exportDocument,
	requiredConnections,
	unwiredConnections,
	renderRequirement,
} from '@serene-pub/sdk'
import type { SpecDocument } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as T from './fixtures.js'
import { publish } from './helpers.js'

// ── 104 · Two names, no inference ──────────────────────────────────────────
describe('104 · createMessage and updateMessage are different types', () => {
	test('each declares the event it causes, so the receipt says which happened', () => {
		assert.equal(C.createMessage.descriptor.causesEvent, 'core:event/message-created@1')
		assert.equal(C.updateMessage.descriptor.causesEvent, 'core:event/message-updated@1')
		// The old type had one causesEvent for both behaviours, which is precisely the
		// information the receipt was missing.
		assert.notEqual(C.createMessage.id, C.updateMessage.id)
	})

	test('updateMessage takes an id from outside the run', () => {
		const doc = publish(
			spec('demo:edit', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('save', ($) =>
					C.updateMessage.v1({ target: $.input.messageId, text: 'edited' }),
				),
		)
		assert.equal(
			doc.nodes.find((n) => n.key === 'save')!.definitionId,
			'core:outlet/update-message',
		)
	})

	test('a message created in the same run is updated by a second node — one primary row', () => {
		// The pipeline owns its row (09-B B4, R-17): a placeholder outlet after
		// the inlet and an update at the end is the reply's shape. It used to
		// fail at publish because under async review the created row might
		// never exist; that position is gone, so the pair is legal and counts
		// as one primary row.
		const doc = publish(
			spec('demo:create-then-edit', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('first', ($) => C.createMessage.v1({ generating: true }))
				.outlet('second', ($) =>
					C.updateMessage.v1({ target: $.first.messageId, text: $.input.text }),
				),
		)
		const edge = doc.edges.find((e) => e.from === 'first' && e.to === 'second')
		assert.equal(edge?.toPort, 'target')
		assert.equal(edge?.shape, 'core:shape/write-result@1')
	})

	test('the placeholder ships review off and is the live row; the update declares no default, so review lands there when enabled', () => {
		assert.equal(C.createMessage.descriptor.reviewDefault, 'off')
		assert.equal(C.createMessage.descriptor.liveRow, true)
		assert.equal(C.updateMessage.descriptor.reviewDefault, undefined)
		assert.equal(C.updateMessage.descriptor.liveRow, undefined)
	})
})

// ── 105 · The rule is checked, not reviewed ────────────────────────────────
describe('105 · a gate-eligible write publishes write-result@1', () => {
	test('declaring row-ids on a write is refused at registration, with the failure named', () => {
		assert.throws(
			() =>
				describeOutletDefinition({
					id: 'demo:outlet/bad-write@1',
					effects: 'write',
					ports: { in: { text: S.text }, out: { main: S.rowIds } },
				}),
			(e: Error) => /dangles when the reviewer rejects/.test(e.message),
		)
	})

	test('every core write type obeys it — which three of them did not', () => {
		// This assertion is why the check exists. Hand-maintained, three core Consumers
		// published raw ids while declaring effects: 'write'.
		const offenders = [
			C.createMessage,
			C.updateMessage,
			C.attachImage,
			C.attachAudio,
			T.savePluginData,
		]
			.map((t) => t.descriptor)
			.filter((d) =>
				Object.values(d.ports.out ?? {}).some((s) => s === 'core:shape/row-ids@1'),
			)
		assert.deepEqual(offenders, [])
	})

	test('a non-write may still publish row ids', () => {
		const ok = describeOutletDefinition({
			id: 'demo:outlet/emit-only@1',
			effects: 'emit',
			ports: { in: { from: S.json }, out: { main: S.rowIds } },
		})
		assert.equal(ok.effects, 'emit')
	})
})

// ── 106 · Migrating the legacy type ────────────────────────────────────────
describe('106 · splitCommitMessage recovers the decision or refuses to guess', () => {
	const legacy = (
		over: Partial<SpecDocument['nodes'][number]> = {},
		edges: SpecDocument['edges'] = [],
	): SpecDocument => ({
		schemaVersion: 1,
		id: 'legacy:chat-turn',
		version: '1.0.0',
		includes: [],
		presets: [],
		clauses: [],
		nodes: [
			{
				key: 'input',
				kind: 'inlet',
				definitionId: 'core:inlet/user-message',
				definitionVersion: 1,
				config: {},
				position: 0,
			},
			{
				key: 'save',
				kind: 'outlet',
				definitionId: 'core:outlet/commit-message',
				definitionVersion: 1,
				config: {},
				position: 1,
				...over,
			},
		],
		edges,
	})

	test('nothing supplies an id → create', () => {
		const { document, report } = splitCommitMessage(legacy())
		assert.equal(
			document.nodes.find((n) => n.key === 'save')!.definitionId,
			'core:outlet/create-message',
		)
		assert.equal(report.entries[0]!.outcome, 'migrated')
		assert.match(report.entries[0]!.reason!, /only ever created/)
	})

	test('an id wired from outside the run → update, and the port is renamed', () => {
		const { document, report } = splitCommitMessage(
			legacy({}, [
				{
					from: 'input',
					fromPort: 'rowIds',
					to: 'save',
					toPort: 'messageId',
					shape: 'core:shape/row-ids@1',
				},
			]),
		)
		assert.equal(
			document.nodes.find((n) => n.key === 'save')!.definitionId,
			'core:outlet/update-message',
		)
		assert.equal(document.edges[0]!.toPort, 'target')
		assert.equal(report.entries[0]!.outcome, 'migrated')
	})

	test('an id from a write in the same run → update, since 09-B B4', () => {
		// It used to be reported rather than decided, because under async
		// review that row might never have existed. A create → update pair on
		// one row inside one run is one primary row now, so it is what it
		// looks like.
		const { document, report } = splitCommitMessage(
			legacy({}, [
				{
					from: 'first',
					fromPort: 'messageId',
					to: 'save',
					toPort: 'messageId',
					shape: 'core:shape/write-result@1',
				},
			]),
		)
		assert.equal(
			document.nodes.find((n) => n.key === 'save')!.definitionId,
			'core:outlet/update-message',
		)
		assert.equal(document.edges[0]!.toPort, 'target')
		assert.equal(unmappedEntries(report).length, 0)
	})

	test('two id sources is ambiguous, so it is unmapped rather than decided', () => {
		const { report } = splitCommitMessage(
			legacy({ config: { messageId: 'row:7' } }, [
				{
					from: 'input',
					fromPort: 'rowIds',
					to: 'save',
					toPort: 'messageId',
					shape: 'core:shape/row-ids@1',
				},
			]),
		)
		assert.equal(unmappedEntries(report).length, 1)
		assert.match(report.entries[0]!.reason!, /which one won was a runtime detail/)
	})

	test('every entry carries a reason — no silent drops', () => {
		assertReportComplete(splitCommitMessage(legacy()).report)
	})
})

// ── 107 · Connections an import must wire (13 §10a) ────────────────────────
describe('107 · requiredConnections is derived from types, not from stored rows', () => {
	const doc = () =>
		publish(
			spec('demo:needs-wiring', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				.oracle('embed', ($) =>
					C.embedText.v1({ text: $.input.text, connection: slot.connection() }),
				)
				// `assemble` declares a connection slot of its own — it renders the
				// prompt for a specific wire format — and every shipped spec
				// SHARES the sending Provider's, which is what the assertion
				// below about `prompt` is checking.
				.task('prompt', ($) =>
					C.assemble.v2({
						connection: slot.connectionOf('generate'),
					}),
				)
				.oracle('generate', ($) =>
					C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
				),
		)

	test('an export names every connection needed, including ones nobody configured', () => {
		// This is why the answer was not a second table: a table could only report what
		// the exporting instance had filled in, so an unconfigured export would claim to
		// need nothing and the importer would find out at the first run.
		const r = exportDocument(doc(), { presets: 'none' })
		assert.deepEqual(
			r.requires.map((x) => `${x.nodeKey}.${x.slot}`),
			['embed.connection', 'generate.connection'],
		)
	})

	test('a slot SHARED with another node is not a binding an importer has to make', () => {
		// `prompt.connection` is `slot.connectionOf('generate')`, and the executor
		// resolves a shared slot against the TARGET's stored value — so a value
		// bound here would be read by nothing. Listing it would ask an importer
		// to configure a second box for one connection, which is the defect the
		// config panel's identical rule already closes.
		const keys = requiredConnections(doc()).map((x) => `${x.nodeKey}.${x.slot}`)
		assert.ok(!keys.includes('prompt.connection'), keys.join(', '))

		// The skip is about SHARING, not about the type: the same node with an
		// unshared slot is still a requirement.
		const own = publish(
			spec('demo:own-connection', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				.task('prompt', ($) =>
					C.assemble.v2({
						connection: slot.connection(),
					}),
				),
		)
		assert.deepEqual(
			requiredConnections(own).map((x) => `${x.nodeKey}.${x.slot}`),
			['prompt.connection'],
		)
	})

	test('each requirement carries the connection kind, so only compatible ones are offered', () => {
		const r = requiredConnections(doc())
		assert.equal(r.find((x) => x.nodeKey === 'embed')!.kind, 'core:shape/embeddings@1')
		assert.equal(r.find((x) => x.nodeKey === 'generate')!.kind, 'core:shape/text-gen@1')
		// The line a person reads names the capability in the words the connection
		// form used, not the shape id the two assertions above check. They are
		// deciding which of their connections to point at this, and
		// `core:shape/embeddings@1` helps them decide nothing — while `kind` above
		// proves the shape is still carried for the machinery that filters on it.
		assert.match(renderRequirement(r[0]!), /needs a connection that supports Embeddings/)
		assert.doesNotMatch(renderRequirement(r[0]!), /core:shape/)
	})

	test('what is still unwired drives needs-configuration, not broken', () => {
		const missing = unwiredConnections(doc(), [{ nodeKey: 'embed', slot: 'connection' }])
		assert.deepEqual(
			missing.map((m) => m.nodeKey),
			['generate'],
		)
		// A spec nobody has configured is unfinished, not damaged — the difference decides
		// whether a user files a bug or opens settings.
		assert.equal(
			unwiredConnections(
				doc(),
				missing.concat({ nodeKey: 'embed', slot: 'connection', definitionId: '', kind: '' }),
			).length,
			0,
		)
	})
})
