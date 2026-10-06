/**
 * Core's **oracle** node definitions — calls out to an external, nondeterministic
 * source: a model, TTS, image generation, embeddings, a person.
 *
 * One file per node kind, with the helpers only that kind uses; `index.ts`
 * re-exports them all.
 */

import { S, tf, IoKinds } from '@serene-pub/sdk'
import { jinja2 } from '@serene-pub/sdk'
import { describeOracleDefinition, pin } from '@serene-pub/sdk'
import type { FieldDecl } from '@serene-pub/sdk'

/**
 * How a provider node wants its request sent.
 *
 * Two values, because only two are deliverable. `auto` defers to the
 * CONNECTION, which already holds an answer and holds a different default per
 * service; `off` forces the single-request branch every adapter has. There is
 * no `on`: a connection whose adapter has no streaming branch could not honour
 * one, and a control that silently means nothing on half the rows is the
 * defect this vocabulary avoids.
 *
 * A factory rather than a shared constant so the four declarations are four
 * objects — a descriptor is snapshotted into registry rows, and an alias
 * shared across pins is one edit away from being four.
 */
const streamingParam = (): FieldDecl => ({
	type: 'enum',
	of: ['auto', 'off'],
	members: [
		{
			key: 'auto',
			label: { en: 'Automatic' },
			description: { en: "Keeps the connection's own Stream setting." },
		},
		{
			key: 'off',
			label: { en: 'Off' },
			description: { en: 'Sends one request and waits — cheaper for background steps.' },
		},
	],
	default: 'auto',
	description:
		"Automatic keeps the connection's own Stream setting; Off sends one request and waits, which is cheaper for background steps.",
})

/**
 * **The model decides who speaks** (PLAN-turn-order R41, M4): the oracle on
 * the turn-order spec's optional model path (`decide.model.advise`). Same
 * ports as a strategy — candidates and the visible history in, prepared turn
 * entries out on `main` and `order` — so the junction's result port reads
 * the same whichever path fired. Its answer is held to the candidates: a
 * ref the pool did not admit is dropped with a note, and an answer that
 * names nobody (or no answer at all) falls back to round robin, noted —
 * never a halt, so a model hiccup never leaves a session without an order.
 *
 * A plugin's own model strategy is a swap for this node: an oracle with
 * these ports and these three slots (the fit check holds it to them).
 * @experimental
 */
export const turnAdvise = pin(
	describeOracleDefinition({
		id: 'core:oracle/turn-advise@1',
		i18n: {
			name: { en: 'Model decides who speaks' },
			description: {
				en: 'Asks the model who should speak next, from the cast that may be seated and the recent conversation. Falls back to round robin when the answer names nobody.',
			},
		},
		shape: S.textGen,
		effects: 'external',
		review: { fields: [] },
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required (the `ctx.can` ruling, as
				 * generate-json): the answer's schema goes out through the
				 * strongest door the connection has — json_schema (natively or
				 * as a grammar), then json_object — and the prompt's own
				 * words are the rung that works everywhere.
				 */
				optional: ['json_schema', 'json_object'],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { turnAdvice: { type: 'text' } },
			},
		},
		ports: {
			in: { candidates: S.turnCandidates, messages: S.messages },
			out: { main: S.turnEntries, order: S.turnEntries },
		},
	}),
)

/**
 * Run the tool the model asked for, and hand the answer back as text it can
 * read on the next pass (20 §9).
 *
 * ## Why this is a Provider and not a Task
 *
 * The two halves either side of it are pure and this one cannot be: a tool
 * reads the session, or reaches an extension's sandboxed hook, which may in
 * turn reach the network under its own grants. That is `effects: 'external'`
 * exactly — and it is the kind that is handed `ctx.call`, so the tool's own
 * dispatch stays behind the host seam where every other outward call lives.
 * A Task with database access would be a second, unaudited read path.
 *
 * ## What it refuses, and what it never throws
 *
 * `tools` is the advertisement the model was actually given, so a name that
 * was never offered is refused **by name** rather than resolved: a model
 * inventing a tool must not be able to reach one that exists but was withheld
 * from this step.
 *
 * A tool that fails is a **result, not an exception**. `main` is
 * `{ tool, error }` and `text` renders it, because the model asking for a
 * missing file needs to read "no such file" and try something else — a throw
 * would end the run at the one moment the agent could have recovered. The
 * type's `timeoutMs` is the time-box per call: one node invocation is one
 * tool, so the executor's own timeout already is the tool's.
 *
 * `call` may be null — that is the ordinary last iteration, where the model
 * answered in prose and the loop is about to stop. Nothing runs and `text` is
 * empty.
 * @experimental
 */
export const runTool = pin(
	describeOracleDefinition({
		id: 'core:oracle/run-tool@1',
		i18n: { name: { en: 'Run tool' } },
		effects: 'external',
		/** The call was the model's and the tool list the install's: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 30000,
		ports: {
			// `call` is parse-tool-call's `{ tool, args } | null`; `tools` is
			// advertise-tools' input, so refusal reads the same list the model
			// saw; `text` is the prose parse-tool-call stripped the call out of.
			in: { call: S.json, tools: S.json, text: S.text },
			/**
			 * Three ports because an iteration produces up to three different
			 * things and one port carrying two of them is a port a downstream
			 * node has to interrogate.
			 *
			 *  - `main` — `{ tool, result }` or `{ tool, error }`, or null when
			 *    nothing was called. One shape, two arms, so nothing downstream
			 *    decides what happened by looking for a missing key.
			 *  - `text` — that rendered as the tool-result block **the next
			 *    prompt carries**. Empty when nothing ran.
			 *  - `answer` — what this iteration contributes to the
			 *    **conversation**: the model's prose, and only on the iteration
			 *    that called no tool, which is the one where the model stopped
			 *    working and answered. Empty otherwise, so joining every
			 *    iteration's `answer` yields the turn's reply and nothing else.
			 */
			out: { main: S.json, text: S.text, answer: S.text },
		},
	}),
)

// ── Providers — identical structure across three modalities (17 §2) ─────────

/** @experimental */
export const embedText = pin(
	describeOracleDefinition({
		id: 'core:oracle/embed-text@1',
		shape: S.embeddings,
		effects: 'external',
		/** Nothing to edit: an embedding of a text somebody else wrote (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 5000,
		/**
		 * ⚠ **Producing nothing is a legitimate outcome, and this is what makes
		 * that structural rather than careful.**
		 *
		 * Embeddings are optional in this product by design: most installs have
		 * no model loaded, and the retrieval plan's second governing rule is an
		 * absolute — *an unavailable mechanism subtracts a signal; it never
		 * reroutes, disables a path, or excludes a candidate.* The host answers
		 * "no embedding model is loaded and validated" by **throwing**, which is
		 * the right answer to give a caller and the wrong thing to let end a
		 * turn.
		 *
		 * `optional` is what turns that error into an empty `ok` in the executor
		 * — recorded, with `recoveredAsEmpty` and the reason on the receipt, so
		 * it is tolerated rather than hidden. The binding's `enabled` parameter
		 * decides how *loudly*: `auto` treats an unavailable model as an absence
		 * and returns no vectors without calling it a failure, `on` lets the
		 * failure be recorded as one. Neither can cost somebody a reply, and
		 * that is the point of putting the guarantee here instead of in a
		 * `try`.
		 *
		 * It also earns the node a "Use this source" switch. ⚠ Not the semantic
		 * mechanism's switch: that is `core:task/query-windows@1`'s
		 * `searchByMeaning`, on the chain's first node, which cuts the probes
		 * before this node is reached. Off here (or `enabled: 'off'`) still
		 * spends nothing, and switches off every embed step that shares
		 * `enabled` — the entity-vector mechanism's too — but it leaves the
		 * semantic chain running on empty, and `vector-search` can only say
		 * nothing was embedded, not why.
		 */
		optional: true,
		/**
		 * ⚠ **No `connection` slot** (removed 2026-10-05, owner ruling D-c). A
		 * pipeline never chooses its embedding connection: the host embeds
		 * through the install's one active embedding connection, whatever a
		 * step names. The slot it carried resolved a value into a port no host
		 * read — ten inert controls across five reply specs, held at the active
		 * connection only so Search by meaning's Automatic could read it.
		 * `core:task/query-windows@1` asks that question on its own slot now.
		 */
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * `shared`: one switch for every embed step of a spec (R-7
					 * P2). `respond` puts it on the semantic mechanism's embed
					 * and the entity-vector mechanism's embed reads it through
					 * `slot.params({ node })` — an install with no embedding
					 * model switches both off in one place, which is the only
					 * reading of "embedding: off" a person means.
					 */
					enabled: {
						type: 'enum',
						of: ['auto', 'on', 'off'],
						members: [
							{
								key: 'auto',
								label: { en: 'Automatic' },
								description: {
									en: 'Embeds when a model is loaded; without one, retrieval goes on without vectors.',
								},
							},
							{
								key: 'on',
								label: { en: 'On' },
								description: {
									en: 'Always embeds; a missing model is recorded as a failure, and the reply still goes out.',
								},
							},
							{
								key: 'off',
								label: { en: 'Off' },
								description: { en: 'Never embeds: semantic matching is switched off.' },
							},
						],
						default: 'auto',
						shared: true,
					},
				},
			},
		},
		ports: {
			in: {
				text: S.text,
				/** Batched: one call, one vector each, in order. */
				texts: S.json,
			},
			out: { main: S.vector, vector: S.vector, vectors: S.json },
		},
	}),
)

/**
 * An MCP tool call (14 §2) — the generic Provider for a tool on any MCP
 * connection. The snapshot path (14 §3) projects each advertised tool as its
 * own registry row under the connection's namespace, typed off the tool's
 * declared input schema; this generic type is the escape hatch beneath them —
 * pin it, choose the connection, name the tool in params.
 *
 * `effects: 'external'` unconditionally: MCP annotations (`readOnlyHint` and
 * friends) are advisory by specification and are never trusted for gating
 * (14 §4). The admin's per-tool classification lives on the snapshot rows;
 * this generic type gates always, because through it any tool is reachable.
 *
 * The result carries the request and response verbatim in its output — which
 * is the receipt, which is the pitch (14 §5): no other MCP client can answer
 * "what did this tool actually do, and did I approve it" from a row.
 * @experimental
 */
export const mcpTool = pin(
	describeOracleDefinition({
		id: 'core:oracle/mcp-tool@1',
		i18n: {
			name: { en: 'MCP tool' },
			description: {
				en: 'Call one tool on a Model Context Protocol server, recorded verbatim and gated like every effectful step.',
			},
		},
		shape: S.mcp,
		effects: 'external',
		/** Declared, not bound — plans/28 owns the handler (plans/29 R-2). */
		provisional: true,
		/** The arguments are the model's invocation: approve or refuse it, never rewrite it (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.mcp,
				/**
				 * ⚠ No `requires`, and that is deliberate rather than an omission.
				 *
				 * The capability space describes io TRANSFORMS — what a model can
				 * be handed and what it gives back. An MCP server is not one: it
				 * serves tools, it does not turn text into anything. The nearest
				 * id, `text->text`, would be false, and claiming it would make
				 * every chat connection in the install look offerable here.
				 *
				 * So this slot keeps filtering by `shape` alone, which is the
				 * right axis for it. `requires` is for slots whose answer is "what
				 * must this connection be able to DO".
				 */
				description: 'Which MCP server this step calls.',
			},
			params: {
				kind: 'parameters',
				schema: {
					tool: {
						type: 'string',
						quick: true,
						label: { en: 'Tool' },
						description: {
							en: 'The advertised tool name on the connected server.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** Arguments for the tool, merged over any declared in params. */
				args: S.json,
			},
			out: {
				main: S.json,
				text: S.text,
				/** The content blocks exactly as the server returned them. */
				content: S.json,
			},
		},
	}),
)

/**
 * An MCP resource read (14 §2) — a Provider, deliberately not a Query. A
 * Query may not reach the network (16 §1), and everything crossing the
 * process boundary must be recorded verbatim so replay never re-infers
 * (F16); a resource is external state that can change between runs, and
 * modelling it as a Query would quietly break both rules.
 * @experimental
 */
export const mcpResource = pin(
	describeOracleDefinition({
		id: 'core:oracle/mcp-resource@1',
		i18n: {
			name: { en: 'MCP resource' },
			description: {
				en: 'Read one resource from a Model Context Protocol server, recorded verbatim.',
			},
		},
		shape: S.mcp,
		effects: 'external',
		/** Declared, not bound — plans/28 owns the handler (plans/29 R-2). */
		provisional: true,
		/** The uri is the invocation: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.mcp,
				// No `requires` — see the sibling MCP node above: a tool server is
				// not an io transform, so `shape` is the right filter here.
				description: 'Which MCP server this step reads from.',
			},
			params: {
				kind: 'parameters',
				schema: {
					uri: {
						type: 'string',
						quick: true,
						label: { en: 'Resource URI' },
						description: {
							en: 'The advertised resource URI on the connected server.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** Overrides the declared URI when wired. */
				uri: S.text,
			},
			out: {
				main: S.json,
				text: S.text,
				content: S.json,
			},
		},
	}),
)

/** @public */
export const generateText = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-text@1',
		i18n: { name: { en: 'Generate reply' } },
		shape: S.textGen,
		effects: 'external',
		/** The payload is the compiled prompt; a prompt rewritten at the gate is one the receipt cannot explain — approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				/**
				 * What the connection must be able to do, as opposed to what it
				 * is called. `shape` above still types the SLOT; this types the
				 * connection, and it is what the picker filters on and what the
				 * bind check refuses by — naming "Chat" rather than an id.
				 *
				 * Only `requires`, deliberately — still, now that the binding DOES
				 * consume `attachments`. It is the Anthropic adapter that sends
				 * them today (as base64 content blocks on the last user turn); a
				 * connection whose adapter has no such code REFUSES a request
				 * carrying files rather than sending it without them, so the
				 * `attachments` port is honest without a slot-level requirement.
				 *
				 * An `optional` vision requirement would meanwhile put a "no
				 * vision" caveat on every text connection in the app, on every
				 * run — and the port is empty on nearly all of them.
				 */
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				description: 'Which model server this step sends its request to.',
			},
			sampling: {
				kind: 'sampling',
				quick: true,
				shape: S.textGen,
				description:
					'The sampling settings — temperature and friends — used for this request.',
			},
			/**
			 * ⚠ No `prompts` slot, and there was one — `system` and
			 * `postHistory`, "the written instructions sent with every request
			 * from this step" (culled 2026-09-16, R-12). No handler read it:
			 * the instructions reach the model INSIDE the assembled context,
			 * through `core:task/assemble@2`'s own `prompts` slot, and this
			 * node sends what it is handed on `context`. Every shipped spec
			 * wired it as `slot.prompts({ node: 'context' })` for one reason
			 * only — so the panel would not render a second copy of the
			 * context builder's text — which is a declaration existing to hide
			 * itself. The same slot on `generate-with-tools@1` and
			 * `generate-json@1` went with it.
			 */
			/**
			 * ⚠ No `template` slot, and there was one — "how the assembled
			 * context is wrapped for this model before sending".
			 *
			 * Nothing read it and nothing seeded a row, so it rendered as an
			 * empty picker beside the settings that do work. Wrapping for the
			 * wire is the `wire` slot's job and the connection adapter's; a
			 * second, inert way to express it invited the two to disagree.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		/**
		 * Vision and interleaved output, declared.
		 *
		 * `accepts` is what makes a multimodal model reachable at all: before
		 * this the only image ports in the whole graph pointed *outward*
		 * (render, attach), so an image could be produced and stored but never
		 * sent. `emits` says a reply may contain generated media — which is
		 * what a single call now routinely returns, interleaved with the prose
		 * rather than beside it.
		 *
		 * Declaring both here does not oblige a connection to do either; the
		 * adapter reports what its model actually supports and the two are
		 * resolved at bind time.
		 */
		media: {
			accepts: ['image', 'document'],
			emits: ['image'],
		},
		ports: {
			in: {
				context: S.assembled,
				/**
				 * Whose reply is being generated — the stop-string exclusion
				 * (§27l): the speaking character's own name must not stop
				 * their own reply. The host already preferred a payload value
				 * over the run scope's; this port is what lets a spec supply
				 * one, so the exclusion follows the next-speaker node's output
				 * (19 §5) instead of the pre-run guess.
				 */
				currentCharacterId: S.rowIds,
				/**
				 * Media travelling with the request — the page a user
				 * attached, the frame a vision step is asked about. A list
				 * because interleaving is ordered and a single ref could not
				 * express "these three, in this order".
				 *
				 * Optional, and never quietly ignored: the host forwards these
				 * references to the dispatch, which resolves each one to bytes
				 * (checking it belongs to this run's session or user) and hands
				 * them to the adapter in this order. A request whose connection
				 * has vision switched off, or whose adapter has no code that
				 * sends files, is REFUSED rather than sent without them —
				 * dropping a file is indistinguishable from a model ignoring it.
				 */
				attachments: S.mediaList,
			},
			/**
			 * `parts` is the honest shape of a completion: an ordered list of
			 * text, reasoning, generated media and tool calls. `main` and
			 * `text` stay exactly as they were — `part-stream` is assignable
			 * to `text-stream`, so every spec wired to them keeps working and
			 * degrades by concatenating the prose.
			 *
			 * `reasoning` is the reasoning trace the dispatch separated from
			 * the text before the text reached the port — published by the
			 * binding since it first stripped one, declared now that a
			 * downstream write (`update-message`) takes it. Empty when the
			 * model produced none.
			 */
			out: {
				main: S.partStream,
				text: S.textStream,
				parts: S.partStream,
				reasoning: S.text,
			},
		},
	}),
)

/**
 * Generate, with the tools on the wire (20 §9) — the native door.
 *
 * ## Why this is a second type rather than two ports on `generate-text`
 *
 * `core:oracle/generate-text@1` is published and frozen: a spec that pinned
 * it must keep meaning what it meant. Adding ports would move its content hash
 * and every install would need a re-projection to keep booting — for a
 * capability most connections do not have. A new pin costs a row and conflicts
 * with nothing.
 *
 * It is otherwise the same node: same shape, same slots, same `context` in and
 * the same `main`/`text`/`parts` out. A spec swaps one for the other and
 * nothing else changes.
 *
 * ## The two doors, and why only one of them parses
 *
 * `advertise-tools` publishes both: `prompt` for models that never heard of
 * tools, `native` for APIs that take a declaration list. Wire `native` here and
 * the adapter puts the tools in the field its service calls them — and reads
 * the answer back out of the structured field, so `toolCall` arrives as data.
 * **There is nothing for `parse-tool-call` to do on this door**: the loop's
 * predicate is this node's own `toolCall`, and `run-tool` takes it directly.
 * Parsing prose the API already parsed would be a second reading of one answer.
 *
 * A connection whose adapter cannot send tools REFUSES a request carrying them
 * rather than sending it without: a model that was never offered a tool and a
 * model that declined one produce the same empty `toolCall`, and dropping the
 * declarations silently is indistinguishable from a model choosing not to call.
 * @experimental
 */
export const generateWithTools = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-with-tools@1',
		i18n: { name: { en: 'Generate with tools' } },
		shape: S.textGen,
		effects: 'external',
		/** The compiled prompt and the tool list: approve or refuse, as `generate-text` (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required, so this node is bindable to every
				 * text connection and the author decides what to do without one
				 * — which is the ruling on `optional` (`ctx.can`): the type
				 * system makes absence impossible to forget about, and the
				 * fallback is the author's to write. A spec that wants the
				 * emulated door instead wires `advertise-tools`' `prompt`.
				 */
				optional: ['tools'],
				description: 'Which model server this step sends its request to.',
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			// No `prompts` slot — see `generateText` (culled 2026-09-16, R-12).
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		media: { accepts: ['image', 'document'], emits: ['image'] },
		ports: {
			in: {
				context: S.assembled,
				/** `advertise-tools`' `native` port — the declarations, verbatim. */
				tools: S.json,
				currentCharacterId: S.rowIds,
				attachments: S.mediaList,
			},
			out: {
				main: S.partStream,
				text: S.textStream,
				parts: S.partStream,
				/**
				 * `{ tool, args }` when the model called one, null when it
				 * answered — the same shape `parse-tool-call` publishes, so
				 * `run-tool` and the loop's predicate take either door without
				 * knowing which was used.
				 */
				toolCall: S.json,
			},
		},
	}),
)

/**
 * Generate, with the ANSWER's shape on the wire — the structured door.
 *
 * ## Why a third generate type rather than a schema port on the other two
 *
 * The same reason `generate-with-tools` is a second one: `generate-text@1` is
 * published and frozen, and a port added to it moves the content hash every
 * spec in every install pins. But the stronger reason here is that this node
 * does not make the same REQUEST. `generate-text` sends a turn — a speaker, a
 * trailing assistant line the model continues — and this sends an instruction.
 * A parameter cannot express that difference honestly: a node whose prompt is
 * sometimes a turn and sometimes a question is two nodes with a flag between
 * them, and the flag is the thing a reader has to find before the receipt makes
 * sense.
 *
 * So: no `currentCharacterId` and no `attachments`, and neither is an omission.
 * The first is the speaker whose reply is being written, and nobody's reply is
 * being written. The second is files travelling with a turn.
 *
 * ⚠ **The trailing assistant line is the TRANSCRIPT's business, not this
 * node's.** A prompt arrives here already rendered, and on a completion wire the
 * seed is an open block inside one string that nothing can take back out. So the
 * guarantee is made where the line is never written:
 * `core:task/prose-transcript@1`, which is what a spec wires into the assemble
 * step feeding this node.
 *
 * ## It parses, and that is not the Provider doing two jobs
 *
 * `parse-json@1`'s own header says why the reading is a separate Task *there*:
 * `generate-text` publishes prose, so the reading is a second step over
 * somebody else's output, and every way it can fail deserves its own node on
 * the receipt. Here the structure IS the output — a request that named a schema
 * and came back with a document has nothing left to interpret — so publishing
 * prose and asking the next node to recover the document from it would be
 * undoing the work this node exists to do.
 *
 * The failures still show. `json` is null and `parseError` carries the sentence
 * when the answer could not be read, and `structured` says which door the
 * request actually went out through, so "the model ignored the schema" and
 * "this connection takes no schema, so there was none" are told apart by
 * reading rather than by guessing.
 *
 * `parse-json@1` stays declared and unchanged: it is content-addressed, other
 * specs pin it, and a reply from `generate-text` still needs it.
 * @public
 */
export const generateJson = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-json@1',
		i18n: { name: { en: 'Generate JSON' } },
		shape: S.textGen,
		effects: 'external',
		/** The compiled prompt and the schema: approve or refuse, as `generate-text` (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		/**
		 * An answer nobody can read costs the structure and nothing else.
		 *
		 * The same guarantee `parse-json@1` makes, kept here because this node
		 * replaced it in the chain: a planner whose document came back malformed
		 * should leave a turn with no plan, narrated anyway, rather than a turn
		 * that failed. The executor records `recoveredAsEmpty` and every
		 * downstream port reads absent, so a `map` over the missing list runs
		 * zero times.
		 */
		optional: true,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required, which is the `ctx.can` ruling: the
				 * node binds to every text connection and the binding decides
				 * what to do without them. The ladder is `json_schema` (the
				 * shape on the wire, natively or compiled to a grammar), then
				 * `json_object` (JSON, shape unsaid), then a sentence in the
				 * prompt — and the last rung works everywhere, so an absence
				 * costs fidelity rather than the step.
				 */
				optional: ['json_schema', 'json_object'],
				description: 'Which model server this step sends its request to.',
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			// No `prompts` slot — see `generateText` (culled 2026-09-16, R-12).
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * Which value inside the answer reaches `value` and `items`.
					 *
					 * A data reference is `{node, port}` with no sub-path, so a
					 * downstream `map` cannot iterate `plan.speakers` off a port
					 * carrying the whole document — the same reason `parse-json`
					 * carries this parameter, and the same spelling.
					 *
					 * Several dotted paths separated by commas are read in order
					 * and their lists joined. That is what makes an answer split
					 * into arms wireable at all: a keeper reports
					 * `{values, inventory}` (its item arm, named for the stat
					 * it resolves onto) because a schema can only be strict
					 * about a list whose items are all one shape, and the node
					 * that resolves them takes one list.
					 */
					path: {
						type: 'string',
						quick: true,
						description:
							'Which value inside the answer to publish on `value` and `items`, as a dotted path. Several paths, separated by commas, are joined in order. Empty publishes the whole answer.',
					},
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		ports: {
			in: {
				context: S.assembled,
				/**
				 * The shape the answer must take, as a JSON Schema document.
				 *
				 * Optional, and the node is useful without it: an unschema'd
				 * request still asks for JSON rather than prose. Supplied, it
				 * reaches whichever field the connection's service calls it —
				 * Ollama's `format`, OpenAI's `json_schema`, a GBNF grammar on
				 * the llama.cpp family — and a connection that takes none
				 * ignores it, which is the degradation rule the adapters
				 * already follow for `responseFormat`.
				 */
				schema: S.json,
			},
			out: {
				/** The parsed document, which is what this node is for. */
				main: S.json,
				json: S.json,
				/** The value at `path` — the document itself when `path` is empty. */
				value: S.json,
				/** That same value as a list, for a `map` to iterate. */
				items: S.json,
				/** What the model actually wrote, for a reader diagnosing the above. */
				text: S.textStream,
			},
		},
	}),
)

/** @experimental */
export const speak = pin(
	describeOracleDefinition({
		id: 'core:oracle/speak@1',
		i18n: { name: { en: 'Speak' } },
		shape: S.tts,
		effects: 'external',
		/** Declared, not bound — plans/14 owns the handler (plans/29 R-2). */
		provisional: true,
		/** The words to be spoken may be corrected before the call (R-15 review fields). */
		review: { fields: ['text'] },
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.tts,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.audio] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.tts },
			template: {
				kind: 'template',
				engine: jinja2.id,
				facet: 'templates',
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: { skipCodeBlocks: { type: 'boolean', default: true } },
			},
		},
		ports: { in: { text: S.text }, out: { main: S.audio, audio: S.audio } },
	}),
)

/**
 * Render an image.
 *
 * The structural twin of `generate-text` and `speak`, which is the whole point:
 * one node KIND (`provider`), one type per modality, and the type's `shape`
 * naming which one. That shape is what makes an image node offerable only an
 * image connection and an image sampling config — and, just as importantly, what
 * gives whatever is wired downstream a settled answer about what comes out of it.
 * A single "generate anything" provider whose ports changed with its connection
 * would be a node no spec could plan around.
 *
 * ## Nothing here belongs to one backend
 *
 * An A1111-compatible server takes width and height directly and names its
 * schedulers its own way; ComfyUI takes a whole graph; a hosted API ignores seed
 * and steps entirely. None
 * of that appears in this declaration, because a slot only one backend honours is
 * a control that does nothing on the other three. What a backend alone offers
 * lives on its CONNECTION, declared by its adapter as a profile schema; what a
 * person means lives here and in the sampling config, and the adapter translates
 * — reporting whatever it could not carry across rather than dropping it quietly.
 *
 * ## Ports
 *
 * `media` carries references, never bytes (media.ts): the run stores the image
 * and passes its uuid on, so a consumer that attaches it and a consumer that
 * posts it both work from the same stored row rather than from a base64 string
 * travelling through the graph. `image` is the first of them, for the common
 * single-image wiring, and `caption` is the prompt that produced it — which is
 * what a message posting the image usually wants as its text.
 *
 * `init` is declared now rather than added later: img2img changes nothing else
 * about this contract, and retrofitting a port onto a published type costs a
 * version bump for every spec pinning it.
 * @experimental
 */
export const generateImage = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-image@1',
		i18n: { name: { en: 'Generate image' } },
		shape: S.imageGen,
		effects: 'external',
		/** The prompt and the negative may be edited; `init` names an asset and may not (R-15 review fields). */
		review: { fields: ['prompt', 'negative'] },
		// Idle rather than wall: a render is minutes on modest hardware, and a
		// backend still reporting progress is working, not hung.
		timeoutMs: 600000,
		timeoutKind: 'idle',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.imageGen,
				/**
				 * The declaration that makes a KoboldCPP connection offerable
				 * here at all: its TYPE says text, and what it can do says
				 * otherwise.
				 */
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.image] })],
				description: 'Which image server this step sends its request to.',
			},
			sampling: {
				kind: 'sampling',
				quick: true,
				shape: S.imageGen,
				description: 'Steps, CFG, size, seed — the settings every image backend shares.',
			},
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: 'How the incoming text becomes what the image model is asked for.',
				fields: {
					positive: { type: 'text' },
					negative: { type: 'text' },
				},
			},
			/**
			 * No `facet`, unlike the text nodes' `weights`: the one parameter
			 * here decides how the request is SENT, and the weights facet is
			 * where a person looks for what the model is asked for.
			 *
			 * On an image backend `off` is the difference between one request
			 * and a render polled for progress and previews, which is the
			 * whole of what a background step saves by turning it off.
			 */
			params: {
				kind: 'parameters',
				schema: { streaming: streamingParam() },
			},
		},
		media: { emits: ['image', 'video'] },
		ports: {
			in: {
				prompt: S.text,
				negative: S.text,
				/** An input image, for backends that report `img2img`. */
				init: S.media,
			},
			out: {
				main: S.mediaList,
				media: S.mediaList,
				image: S.image,
				caption: S.text,
			},
		},
	}),
)

/**
 * A plugin's own image provider, kept as the worked example of one: same shape,
 * same slots, a `params` schema of its own. Nothing in core dispatches it.
 * @internal
 */
export const renderImage = pin(
	describeOracleDefinition({
		id: 'chariot.comfy:render-image@1',
		shape: S.imageGen,
		effects: 'external',
		/** A sample plugin oracle: its payload is a compiled prompt — approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 300000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.imageGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.image] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.imageGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: {
					positive: { type: 'text' },
					negative: { type: 'text' },
				},
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: { steps: { type: 'integer', default: 25 } },
			},
		},
		ports: {
			in: { context: S.assembled },
			out: { main: S.image, image: S.image },
		},
	}),
)

// ── Sprites (DESIGN-sprites §5, 2026-09-24; in-pipeline 2026-10-05) ─────────
//
// A **sprite** is one labelled image a card can show — an emotion, an outfit,
// a pose. After a reply is saved, each reply spec chooses which one the line
// shows in two steps it writes out itself: the **sprite picker**
// (`core:oracle/pick-sprite@1`), handed the line's own text and whose line it
// is, and `show-sprite`, which records the pick on the line.
//
// Until 2026-10-05 a core-catalog wrapper appended a hidden tail of four nodes
// to five reply specs — `sprites-for` (which re-read the line from its message
// id and embedded inside the host), a junction, a pure picker task and the
// outlet — and the host read the picker's settings ahead of the run. The owner
// ruled it in-pipeline: every input is visible where the spec places the step.

/**
 * **The sprite picker** — which sprite a line shows, chosen in one step from
 * what the reply spec hands it: the line's text, whose line it is, and (when
 * the spec knows it) the sprite set.
 *
 * All in one (owner, 2026-10-05). The step reads what the speaker can show —
 * the set in force and that set's sprite labels, and the speaker's recent
 * faces — then embeds the line and the labels, and picks the label whose
 * vector is closest to the line's, with a small penalty on labels shown in the
 * speaker's recent lines and a **stickiness margin**: the last shown sprite is
 * kept unless the best beats it by `margin`, which stops a face flickering on
 * every line. The receipt answers "why this face": `choices` carries the set
 * and how it was decided, `pick` the label, its score, the runner-up and
 * whether stickiness held.
 *
 * ⚠ **An oracle, because it embeds.** An embedding model is an external,
 * nondeterministic source, and with an embedding service it is a provider
 * call — one per reply whose speaker has sprites, after the reply is saved, so
 * it never delays the reply. A task is pure and a query may not reach the
 * network; this step does both of the things they may not.
 *
 * ⚠ **No connection slot.** A pipeline never chooses its embedding connection:
 * the host embeds through the install's one active embedding connection, by
 * policy, as it does for `embed-text`. Label vectors are the host's to cache
 * per model.
 *
 * **Picks nothing** — null, and embeds nothing — when `enabled` is off, when
 * the speaker has no sprites (no `speaker`, an envoy, a card with no art), or
 * when no embedding model is set up: an absent mechanism subtracts a signal, it
 * never guesses. A fault here must never fail a delivered reply, so the
 * binding answers a failure with null rather than an error.
 *
 * Not `core:outlet/show-sprite@1`, which records a pick; not the sprite set
 * slot (`core:slot/sprite-set@1`), which is the session's override this step
 * reads.
 * @experimental
 */
export const pickSprite = pin(
	describeOracleDefinition({
		id: 'core:oracle/pick-sprite@1',
		i18n: { name: { en: 'Closest sprite' } },
		effects: 'external',
		/** Nothing to edit: a choice among the card's own sprites (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 5000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Sprites off for this session (or instance): the picker
					 * picks nothing and embeds nothing, and faces stay as they
					 * are.
					 */
					enabled: {
						type: 'boolean',
						label: 'Choose sprites',
						description:
							"Choose a sprite for each character's line. Off leaves faces as they are.",
						default: true,
					},
					margin: {
						type: 'number',
						label: 'Stickiness',
						description:
							'How much closer a new sprite must be before the face changes. Higher keeps faces steadier.',
						min: 0,
						max: 0.5,
						default: 0.04,
					},
					floor: {
						type: 'number',
						label: 'Minimum similarity',
						description:
							'A line less similar than this to every sprite keeps the last one, or shows neutral.',
						min: 0,
						max: 1,
						default: 0.1,
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * The line's own text — the reply string the spec saved, wired
				 * from the step that produced it. Never re-read from the row:
				 * that is the hidden read this step replaced.
				 */
				text: S.text,
				/**
				 * Whose line it is, as a **participant reference** — the one the
				 * spec wrote the reply row as (the inlet's `speaker`, or a
				 * character turn's own). `character:<id>` has a card, and so may
				 * have sprites; `envoy:<slug>`, or none at all (a narrator's
				 * line), has none, and the pick is null.
				 */
				speaker: S.participantRef,
				/**
				 * The session the line is in — where the set is decided (the
				 * session's override, the cast member's set at the session's
				 * reading) and the speaker's recent faces are found: their
				 * lines in this session other than the one this run is
				 * writing. ⚠ Never read for whose line it is; that is `speaker`.
				 */
				scope: S.sessionScope,
				/**
				 * The sprite set to choose within, when the spec knows it.
				 * Absent — every core spec — the set is decided from the
				 * speaker, in one order: the session's override, then the cast
				 * member's set, then the card's default set. A name the card
				 * has no set by falls to the default set and says so on
				 * `choices`, never silently.
				 */
				set: S.text,
			},
			out: {
				/** The pick, `sprite-pick@1`: `{ set, label, … }`, or null for none. */
				main: S.spritePick,
				pick: S.spritePick,
				/**
				 * What the speaker could show, and how the set was decided
				 * (`decidedBy`, `missing`) — for the receipt, never for the line.
				 */
				choices: S.spriteChoices,
			},
		},
	}),
)

// ── Summarization ───────────────────────────────────────────────────────────

/** Phase 1 — one batch, drafted without sight of any other. @internal */
export const summarizeBatch = pin(
	describeOracleDefinition({
		id: 'core:oracle/summarize-batch@1',
		i18n: { name: { en: 'Draft a batch' } },
		shape: S.textGen,
		effects: 'external',
		/** A drafting call over a batch: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		/**
		 * The first interior point (18 §4e), and core dogfooding it (07 §0b):
		 * every intermediate draft passes the user's chain before synthesis
		 * reads it — slop killed in the material summaries are built *from*,
		 * not only in final replies. Invoked by the binding via
		 * `ctx.scripts.applyText('each-draft', …)`; recorded per application
		 * as `appliedBy: 'binding'`. Declares what it accepts (R-11): a draft
		 * is text, so text transforms — said here rather than assumed by the
		 * broker, which is the difference between a point a plugin can shape
		 * and a literal in the executor.
		 */
		scriptPoints: [
			{
				key: 'each-draft',
				accepts: ['core:script:text/transform@1'],
				label: { en: 'Each draft' },
				description: {
					en: 'Runs over every intermediate draft this step produces, before synthesis reads them.',
				},
			},
		],
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { batch: { type: 'text' } },
			},
		},
		ports: {
			// `request` carries what a person asked for — the topic line, most
			// visibly — so the drafting prompt can honour it. The whole request
			// object travels rather than a plucked field, because what the
			// request holds is the socket's contract with its modal, not this
			// node's to enumerate.
			in: {
				batch: S.messages,
				request: S.summarizeRequest,
				/**
				 * Which kind of entry this pipeline writes — the word every
				 * summarize prompt template branches on (D-I).
				 *
				 * ## A port, not a parameter, and the call site is what decides
				 *
				 * `summarizeSpec` writes it as a **literal into the node's
				 * config**, in the same map as `batch` and `request` and
				 * alongside them: `C.summarizeBatch.v1({ batch, request,
				 * loreType, … })`. `resolveInput` passes a non-ref config value
				 * through untouched, so the binding reads `input.loreType`
				 * exactly the way it reads a port — same position, same access,
				 * same absence-is-`undefined`. Declaring it as anything else
				 * would describe a mechanism that is not the one running.
				 *
				 * A `params` field is the alternative, and it is the wrong one
				 * twice over. It would move the read to `input.params.loreType`
				 * — a different value from a different layer — and it would put
				 * the control in the panel, stored per configuration and
				 * layered instance → user → session like every other parameter.
				 * `SummarizeShape` in the catalog already rules on that: this is
				 * "the thing that distinguishes the four namespaces from one
				 * another", and a user who changed it "would turn their scene
				 * summarizer into a world summarizer without renaming
				 * anything".
				 *
				 * ⚠ An in-port no edge feeds is not a contradiction here. A
				 * port is a named input the node reads; where the value comes
				 * from — an upstream node, or an author writing it down — is the
				 * document's business. What the declaration buys is that the
				 * name is now checkable: the app's binding types derive their
				 * legal reads from `ports.in`, so `input.loreTypes` stops
				 * compiling, and the panel and the plugin validator can both see
				 * that this node takes one.
				 *
				 * `text` rather than an enum shape: a shape ids a payload, and
				 * the four legal words are the prompt templates' vocabulary,
				 * which a plugin summarizer is free to extend.
				 */
				loreType: S.text,
			},
			out: { main: S.textStream, draft: S.textStream },
		},
	}),
)

/** Phase 2 — the ordered drafts merged into one past-tense narrative. @internal */
export const summarizeSynth = pin(
	describeOracleDefinition({
		id: 'core:oracle/summarize-synth@1',
		i18n: { name: { en: 'Synthesize the drafts' } },
		shape: S.textGen,
		effects: 'external',
		/** The merge call: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { synth: { type: 'text' } },
			},
		},
		ports: {
			// Same `request` pass-through as the batch step: the topic reaches
			// synthesis too, or a focused summary drifts back to a general one
			// the moment the drafts are merged.
			in: {
				drafts: S.drafts,
				request: S.summarizeRequest,
				/** Authored on the node, exactly as on the batch step — see it. */
				loreType: S.text,
			},
			out: { main: S.textStream, content: S.textStream },
		},
	}),
)

/** What the entry gets called. Its own step because it has its own prompt. @internal */
export const nameEntry = pin(
	describeOracleDefinition({
		id: 'core:oracle/name-entry@1',
		i18n: { name: { en: 'Name the entry' } },
		shape: S.textGen,
		effects: 'external',
		/** Approve or refuse; the name it produces is reviewed at the entry's write (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { name: { type: 'text' } },
			},
		},
		ports: {
			in: {
				content: S.text,
				/** Authored on the node, exactly as on the two steps above — see them. */
				loreType: S.text,
			},
			out: { main: S.textStream, name: S.textStream },
		},
	}),
)

/**
 * Who was in the scene — scene summaries only.
 *
 * Present on one summarize pipeline and not the other three, which is exactly
 * why they are four specs rather than one spec with a flag. A flag would put the
 * difference in a condition somebody has to find; four specs put it in the shape.
 * @internal
 */
export const extractCast = pin(
	describeOracleDefinition({
		id: 'core:oracle/extract-cast@1',
		i18n: { name: { en: 'Extract the cast' } },
		shape: S.textGen,
		effects: 'external',
		/** Approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { characterExtraction: { type: 'text' } },
			},
			/**
			 * The two halves of a replaceable core function, on the scripts
			 * rung. Scripts here *shape* the extraction — what the model reads,
			 * what the pipeline keeps. Replacing the extractor itself is the
			 * other rung: a same-shaped provider offered by the swap list,
			 * because extraction calls a model and scripts are pure compute.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'content',
				phase: 'before',
				description:
					'Scripts over the scene text before the extractor reads it — strip out-of-character chatter, normalise a nickname, redact.',
			},
			castScripts: {
				kind: 'scripts',
				accepts: ['core:script:cast/transform@1'],
				port: 'cast',
				phase: 'after',
				description:
					'Scripts over the extracted cast — rename someone, merge aliases, drop a junk detection, add someone the model missed.',
			},
		},
		ports: {
			// `request` carries the known cast list ([id: N] entries) so the
			// extraction prompt can reference real ids — without it the model
			// invents castIds and the resolve step silently drops every one.
			//
			// ⚠ No `messages` in-port, and there was one (culled 2026-09-16,
			// R-12). `summarize` wired the transcript into it and the handler
			// never read it: the extractor works from `content` — the synthesised
			// summary — which is what the prompt builder takes. A port a spec
			// fills and nothing reads costs the run a copy of the transcript
			// and tells a reader the extractor sees it.
			in: {
				content: S.text,
				request: S.summarizeRequest,
			},
			out: { main: S.json, cast: S.json },
		},
	}),
)

// ── Graph build ─────────────────────────────────────────────────────────────

const graphStep = (id: string, label: string, field: string, extra: { timeoutMs?: number } = {}) =>
	pin(
		describeOracleDefinition({
			id,
			i18n: { name: { en: label } },
			shape: S.textGen,
			effects: 'external',
			/** Each graph step sends a compiled prompt: approve or refuse (R-15 review fields). */
			review: { fields: [] },
			timeoutMs: extra.timeoutMs ?? 120000,
			timeoutKind: 'idle',
			usage: 'response.usage',
			slots: {
				connection: {
					kind: 'connection',
					quick: true,
					shape: S.textGen,
					requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				},
				sampling: { kind: 'sampling', quick: true, shape: S.textGen },
				prompts: {
					kind: 'prompts',
					quick: true,
					facet: 'prompts',
					fields: { [field]: { type: 'text' } },
				},
			},
			ports: {
				in: { scenes: S.graphScenes },
				out: { main: S.json, result: S.json },
			},
		}),
	)

/** Which existing node a mentioned name refers to, or whether it is new. @internal */
export const graphNodeResolution = graphStep(
	'core:oracle/graph-node-resolution@1',
	'Resolve nodes',
	'nodeResolution',
)

/** Drop what is not worth graphing before the expensive steps run. @internal */
export const graphPreFilter = graphStep(
	'core:oracle/graph-pre-filter@1',
	'Pre-filter',
	'preFilter',
)

/** Whose account of the scene this is. @internal */
export const graphPerspective = graphStep(
	'core:oracle/graph-perspective@1',
	'Perspective',
	'perspective',
)

/** The two-sentence introduction written for a newly discovered character. @internal */
export const graphNodeDescription = graphStep(
	'core:oracle/graph-node-description@1',
	'Describe new nodes',
	'nodeDescription',
)

/** Did any present character reach a new lifecycle state this scene? @internal */
export const graphStateDetection = graphStep(
	'core:oracle/graph-state-detection@1',
	'Detect state changes',
	'stateDetection',
)
