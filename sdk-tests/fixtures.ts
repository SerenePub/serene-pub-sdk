/**
 * Definitions the suite declares for itself (plans/29 R-2, 2026-09-17).
 *
 * Each of these stood in `@serene-pub/contracts` under a `core:` id with no
 * handler behind it, and was culled from there because a published definition
 * nothing runs is a promise the registry cannot keep. The executor proofs that
 * placed them — a stream consumer with `earlyExit`, a map/reduce join, an
 * emit-class outlet, a source template, a second modality — still need a node
 * of that shape, so the shape lives here under the `test:` namespace beside
 * `test:task/gate@1` and its siblings, registered when the suite imports it and
 * never published by core.
 *
 * `describe*Definition` registers on call, so importing this module is what
 * makes `T.chunkText.v1()` compile and `getDefinition` answer; `helpers.ts`
 * imports it so every fixture host carries their stand-ins.
 */

import {
	S,
	jinja2,
	describeOracleDefinition,
	describeOutletDefinition,
	describeQueryDefinition,
	describeTaskDefinition,
	pin,
} from '@serene-pub/sdk'

/** Cuts text into items for a map to iterate. */
export const chunkText = pin(
	describeTaskDefinition({
		id: 'test:task/chunk-text@1',
		timeoutMs: 1000,
		ports: { in: { text: S.text }, out: { main: S.json, items: S.json } },
	}),
)

/** Consumes a stream and may finish before it ends (01 §11) — the earlyExit proofs. */
export const firstJson = pin(
	describeTaskDefinition({
		id: 'test:task/first-json@1',
		timeoutMs: 5000,
		earlyExit: true,
		ports: { in: { main: S.textStream }, out: { main: S.json } },
	}),
)

/** Turns a repeated block's values back into candidate blocks — the map/reduce join. */
export const toCandidates = pin(
	describeTaskDefinition({
		id: 'test:task/to-candidates@1',
		timeoutMs: 500,
		ports: {
			in: { items: S.text },
			out: { main: S.candidates, candidates: S.candidates },
		},
	}),
)

/** A message's text by row id — the query a second-modality pipeline opens with. */
export const messageText = pin(
	describeQueryDefinition({
		id: 'test:query/message-text@1',
		timeoutMs: 1000,
		ports: {
			in: { messageId: S.json },
			out: { main: S.text, plain: S.text },
		},
	}),
)

/** A card as candidates — a query inside a gather clause. */
export const personaCard = pin(
	describeQueryDefinition({
		id: 'test:query/persona-card@1',
		timeoutMs: 1000,
		ports: {
			in: { characterId: S.json },
			out: { main: S.candidates, card: S.candidates },
		},
	}),
)

/**
 * A source template: renders one entry, so its scope is the item's shape,
 * which lives inside the port's payload and not on the port (16 §4
 * correction) — the declaration test 34 reads.
 */
export const renderEntries = pin(
	describeTaskDefinition({
		id: 'test:task/render-entries@1',
		timeoutMs: 500,
		slots: {
			template: {
				kind: 'template',
				engine: jinja2.id,
				facet: 'templates',
				variables: {
					entry: {
						type: 'object',
						fields: {
							title: { type: 'string', description: { en: "The entry's name." } },
							content: { type: 'string', description: { en: 'The text itself.' } },
							keys: {
								type: 'list',
								of: { type: 'string' },
								optional: true,
								description: { en: 'The keywords that triggered it.' },
							},
						},
					},
				},
				description:
					'How a retrieved entry is written into the context. Leave empty to use the built-in wording.',
			},
		},
		ports: {
			in: { entries: S.candidates },
			out: { main: S.renderedBlocks },
		},
	}),
)

/** The one emit-class outlet the suite has — emits are unlimited (F7). */
export const emitSocket = pin(
	describeOutletDefinition({
		id: 'test:outlet/emit-socket@1',
		effects: 'emit',
		timeoutMs: 1000,
		ports: { in: { from: S.json }, out: { main: S.json } },
	}),
)

/** A write whose whole payload is the reviewable value. */
export const savePluginData = pin(
	describeOutletDefinition({
		id: 'test:outlet/save-plugin-data@1',
		effects: 'write',
		review: { fields: ['value'] },
		timeoutMs: 5000,
		ports: { in: { value: S.json }, out: { main: S.writeResult } },
	}),
)

/**
 * An effectful oracle with an `args` port and an MCP-shaped connection slot —
 * the tool-loop and gate proofs. Its `core:` twin is provisional (plans/28
 * owns the handler), which is exactly why the proofs cannot place it.
 */
export const mcpTool = pin(
	describeOracleDefinition({
		id: 'test:oracle/mcp-tool@1',
		shape: S.mcp,
		effects: 'external',
		review: { fields: [] },
		timeoutMs: 60000,
		slots: {
			connection: { kind: 'connection', quick: true, shape: S.mcp },
			params: {
				kind: 'parameters',
				schema: { tool: { type: 'string', quick: true } },
			},
		},
		ports: { in: { args: S.json }, out: { main: S.json, text: S.text, content: S.json } },
	}),
)

/**
 * A TTS oracle: the same two slots the text oracle declares, on the `tts`
 * shape — what the modality-agnosticism proof places. Its `core:` twin is
 * provisional (plans/14 owns the handler).
 */
export const speak = pin(
	describeOracleDefinition({
		id: 'test:oracle/speak@1',
		shape: S.tts,
		effects: 'external',
		review: { fields: ['text'] },
		timeoutMs: 60000,
		slots: {
			connection: { kind: 'connection', quick: true, shape: S.tts },
			sampling: { kind: 'sampling', quick: true, shape: S.tts },
		},
		ports: { in: { text: S.text }, out: { main: S.audio, audio: S.audio } },
	}),
)

/**
 * A task that takes `ms` to finish — a stand-in for a model call, so a chain
 * declared first can finish last (C8's write-order half, W1b).
 */
export const delay = pin(
	describeTaskDefinition({
		id: 'test:task/delay@1',
		timeoutMs: 5000,
		ports: { in: { ms: S.json }, out: { main: S.json } },
	}),
)
