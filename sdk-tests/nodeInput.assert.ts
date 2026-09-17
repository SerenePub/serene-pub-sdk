/**
 * Handler input types, asserted at COMPILE time (ruling 2026-09-10).
 *
 * This file is checked by `tsc --noEmit` and is never run, for the same reason
 * `capabilityTypes.assert.ts` is: what it guards **cannot be observed at
 * runtime**. A handler reading `input.topK` off a node that declares no such
 * port does not throw, does not log and does not fail a test — it gets
 * `undefined` and falls through to whatever literal sits behind the `??`. That
 * is exactly how `core:query/vector-search@1` searched at 40 for the whole life
 * of the mechanism while a validated, saved, scope-resolved `12` reached
 * nothing, and how `core:query/session-history@1`'s `limit` did the same.
 *
 * Every `@ts-expect-error` below FAILS THE BUILD if the error it expects stops
 * happening. So a widening bug — a `const` dropped, an `S` erased back into
 * `Record<string, SlotDecl>`, an `any` slipped into `InputOf` — shows up here
 * as "unused '@ts-expect-error' directive", which reads as nonsense until you
 * know why this file exists. Hence this comment.
 */

import {
	describeQueryDefinition,
	pin,
	reads,
	S,
	ok,
	type InputOf,
	type InPortsOf,
	type ParamNamesOf,
	type ParamsOf,
	type SharedInput,
	type SlotNamesOf,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

// ── The two defects that shipped ────────────────────────────────────────────

declare const search: InputOf<typeof C.vectorSearch>

// ✅ declared in-ports
const _vectors: unknown = search.vectors
const _scope: unknown = search.scope

// ✅ declared parameters, and typed from the schema's `type`
const _topK: number | undefined = search.params?.topK
const _maxEntries: number | undefined = search.params?.maxEntries
const _falloff: number | undefined = search.params?.similarityFalloff

// @ts-expect-error — THE DEFECT. `topK` is a parameter of this node, not an
// in-port; the binding read it here and the host ran on a literal 40 for the
// mechanism's entire life.
search.topK

// @ts-expect-error — `minScore` was declared, never read, and then deleted.
// A read of it must not compile back into existence.
search.params?.minScore

declare const history: InputOf<typeof C.sessionHistory>
const _limit: number | undefined = history.params?.limit
const _channel: string | undefined = history.params?.channel

// @ts-expect-error — THE SECOND DEFECT, same shape: `limit` is a parameter,
// and the top-level read fell through to a literal 100 on every run.
history.limit

// @ts-expect-error — and its twin, which never had a supplier either
history.channel

// ── Parameter values come from the field language ───────────────────────────

declare const assemble: InputOf<typeof C.assemble>
declare const embed: InputOf<typeof C.embedText>

// An `enum` narrows to its declared choices, not to `string`.
const _enabled: 'auto' | 'on' | 'off' | undefined = embed.params?.enabled
// @ts-expect-error — not one of the three choices `of` declares
const _badEnabled: 'auto' | 'on' | 'off' | undefined = 'maybe'

// @ts-expect-error — `truncation` was declared on assemble, rendered, and read
// by nothing; culled 2026-09-16 (R-12). A read of it must not compile it back.
assemble.params?.truncation

// @ts-expect-error — an integer parameter is a number, not a string
const _wrongType: string | undefined = assemble.params?.postHistoryDepth

// ── A node with no parameters has no `params` at all ────────────────────────

declare const userMessage: InputOf<typeof C.userMessage>
// ✅ the one slot this input type declares
const _scripts: unknown = userMessage.scripts
// @ts-expect-error — this type declares no `parameters` slot, so there is no
// `params` object to read. Previously a fixed slot vocabulary let every node
// accept `input.params` and hand back `undefined`.
userMessage.params

// @ts-expect-error — nor a `template` slot, which the fixed vocabulary also
// allowed on every node in the catalog
userMessage.template

// ── The name sets, directly ─────────────────────────────────────────────────

const _inPort: InPortsOf<typeof C.vectorSearch> = 'vectors'
// @ts-expect-error — a parameter is not an in-port
const _notInPort: InPortsOf<typeof C.vectorSearch> = 'topK'

const _slot: SlotNamesOf<typeof C.vectorSearch> = 'params'
const _param: ParamNamesOf<typeof C.vectorSearch> = 'similarityFalloff'
// @ts-expect-error — a typo in a parameter name is the population this exists for
const _typo: ParamNamesOf<typeof C.vectorSearch> = 'similarityFallof'

// `ParamsOf` is the object, keys optional because a config that never set a
// control simply has no key for it.
const _params: ParamsOf<typeof C.sessionHistory> = {}
const _params2: ParamsOf<typeof C.sessionHistory> = { limit: 25 }
// @ts-expect-error — excess keys are the whole point
const _params3: ParamsOf<typeof C.sessionHistory> = { limt: 25 }

// ── Shared handlers: the INTERSECTION of what the contracts supply ──────────

// The three lore lanes are one scan filtered three ways, and they declare the
// same ports and the same schema — so the intersection is the whole of it.
declare const lore: SharedInput<
	[typeof C.worldLore, typeof C.characterLore, typeof C.historyEntries]
>
const _loreScope: unknown = lore.scope
const _loreScan: number | undefined = lore.params?.scanDepth
// @ts-expect-error — still not a port on any of the three
lore.limit
// @ts-expect-error — `text` was declared on all three, filled by nothing and
// read by nothing; culled 2026-09-16 (R-12)
lore.text

// Two contracts that agree on one name and disagree on the rest. Written as
// local declarations rather than borrowed from the catalog, so the assertion
// says what it means even if the catalog's shapes move.
const alpha = pin(
	describeQueryDefinition({
		id: 'test:query/alpha@1',
		ports: { in: { shared: S.text, onlyAlpha: S.text }, out: { main: S.text } },
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					both: { type: 'integer', default: 1 },
					onlyAlpha: { type: 'string', default: '' },
				},
			},
		},
	}),
)
const beta = pin(
	describeQueryDefinition({
		id: 'test:query/beta@1',
		ports: { in: { shared: S.text, onlyBeta: S.text }, out: { main: S.text } },
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					both: { type: 'integer', default: 2 },
					onlyBeta: { type: 'boolean', default: false },
				},
			},
		},
	}),
)

declare const shared: SharedInput<[typeof alpha, typeof beta]>
// ✅ both declare it
const _both: number | undefined = shared.params?.both
const _sharedPort: unknown = shared.shared
// @ts-expect-error — alpha declares it; beta does not, so the shared handler
// may not read it. THIS is the flexibility rule: one handler, several types,
// bounded by what every one of them supplies.
shared.onlyAlpha
// @ts-expect-error — and the same in the other direction
shared.onlyBeta
// @ts-expect-error — a parameter only one of them declares
shared.params?.onlyAlpha
// @ts-expect-error — likewise
shared.params?.onlyBeta

// Bound to one type alone, both of its own names are readable — the
// intersection is a restriction of the single-contract case, never a different
// answer.
declare const alphaOnly: InputOf<typeof alpha>
const _alphaPort: unknown = alphaOnly.onlyAlpha
const _alphaParam: string | undefined = alphaOnly.params?.onlyAlpha

export {}

// ── `reads` — a declaration the contract checks ─────────────────────────────
//
// The runtime twin of the reads above: a handler SAYS what it reads, in the
// two categories `InputOf` derives, and the contract refuses a name it does
// not supply. So a typo in the declaration fails the build exactly as a typo
// in the read does — which is what stops the two lists naming different
// things.

const historyHook = async (_input: InputOf<typeof C.sessionHistory>) => ok({ main: [] })

// ✅ every name is one the contract declares. `params` itself is not a port
// here: what a handler reads off it is declared field by field, one line down.
reads<typeof C.sessionHistory>(historyHook, {
	ports: ['scope'],
	params: ['limit', 'channel', 'priority'],
})
reads<typeof C.sessionHistory>(historyHook, {
	// @ts-expect-error — the `params` slot is declared through its fields, never
	// as a port
	ports: ['params'],
})

reads<typeof C.sessionHistory>(historyHook, {
	// @ts-expect-error — `limt` is nobody's parameter
	params: ['limt'],
	ports: [],
})

reads<typeof C.sessionHistory>(historyHook, {
	// @ts-expect-error — `budget` was this node's in-port until it was culled
	// (2026-09-16); declaring a read of it must not compile it back
	ports: ['budget'],
})

reads<typeof C.sessionHistory>(historyHook, {
	// @ts-expect-error — `topK` is another node's parameter
	params: ['topK'],
	ports: [],
})

// A shared handler declares against the INTERSECTION, in the tuple spelling
// `SharedInput` takes.
const loreHook = async (
	_input: SharedInput<[typeof C.worldLore, typeof C.characterLore, typeof C.historyEntries]>,
) => ok({ main: [] })
reads<[typeof C.worldLore, typeof C.characterLore, typeof C.historyEntries]>(loreHook, {
	ports: ['scope'],
	params: ['scanDepth', 'guaranteedMessages', 'admitThreshold'],
})
reads<[typeof C.worldLore, typeof C.characterLore, typeof C.historyEntries]>(loreHook, {
	// @ts-expect-error — no lane declares a `limit` port
	ports: ['limit'],
})

// A node with no parameters accepts only an empty `params`.
const inletHook = async (input: InputOf<typeof C.userMessage>) => ok(input)
reads<typeof C.userMessage>(inletHook, { ports: [], params: [] })
reads<typeof C.userMessage>(inletHook, {
	ports: [],
	// @ts-expect-error — this node declares no parameters, so no name fits
	params: ['anything'],
})
