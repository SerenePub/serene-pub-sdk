/**
 * Use case 95 — the conformance kit, run against the reference implementation.
 *
 * The kit exists for SP Core to run against *its* executor. Running it here is what keeps
 * it honest: a requirement the reference implementation cannot pass is a requirement
 * stated wrong, and it would otherwise be discovered by whoever is porting, months later,
 * with no way to tell whether the kit or their code is at fault.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { spec } from '@serene-pub/sdk'
import { compile, canonicalHash, importDocument } from '@serene-pub/sdk'
import { validate, assertValid } from '@serene-pub/sdk'
import { run, replay, ok, halt } from '@serene-pub/sdk'
import { slot, $ref } from '@serene-pub/sdk'
import {
	actionsOf,
	placeActions,
	slashNameOf,
	LISTED_VENUE_KINDS,
	type NormalizedAction,
	type VenueListing,
	type VenueListings,
} from '@serene-pub/sdk'
import {
	conform,
	renderConformance,
	REQUIREMENTS,
	type HostUnderTest,
	type Fixtures,
	type ListedAction,
} from '@serene-pub/conformance'
import {
	S,
	describeOracleDefinition,
	describeOutletDefinition,
	describeQueryDefinition,
	describeTaskDefinition,
	pin,
	use,
	sessionEvents,
} from '@serene-pub/sdk'
import type {
	DisplayTextInput,
	EffectsLineInput,
	ProvisionalInput,
	SettingsTravelInput,
	SpecDocument,
} from '@serene-pub/sdk'
import {
	pluginNodeBindings,
	type HookCtxKind,
	type PluginHandlerContext,
} from '@serene-pub/sdk/testing'
import * as C from '@serene-pub/contracts'
import { coreAnnouncement } from '@serene-pub/core-catalog'
// The preview harness's frame port — the SDK's reference *host* half of the
// frame wire, imported the way `framePort.test.ts` imports it (it carries no
// DOM, deliberately). C26 asks the host which frame → host messages it
// answers, and a list written out here by hand would pass any host.
import { answerFrameMessage, frameStateStore } from '../ui-preview/src/lib/framePort.js'
import { mountCode } from './componentMount.js'
import * as T from './fixtures.js'
import { bindings, world } from './helpers.js'

/**
 * The SDK host's venue projection (C19's seam): `placeActions` over the
 * document's actions, each entry decorated with the slash name it is called
 * by — the shape core's `listSessionActions` returns, minus what only a
 * session can decide (audience, the *new* mark, enablement).
 */
const listActions = (doc: Parameters<typeof actionsOf>[0], channel: string): VenueListings<ListedAction> => {
	const placed = placeActions(actionsOf(doc), channel)
	const entry = (a: NormalizedAction & { specId: string }): ListedAction => ({
		key: a.key,
		specId: a.specId,
		slash: slashNameOf(a, a.specId),
	})
	return Object.fromEntries(
		LISTED_VENUE_KINDS.map((k) => [
			k,
			{ primary: placed[k].primary.map(entry), overflow: placed[k].overflow.map(entry) },
		]),
	) as VenueListings<ListedAction>
}

// ── C25's seam: what a plugin's handler is handed ───────────────────────────

/**
 * Three definitions under a package's own namespace — the kinds a plugin
 * actually places (`pluginHarness.test.ts`, G13). The outlet is **emit-class**
 * on purpose: a plugin write-class outlet has no commit path at all, which is
 * the same law C25 reads off the absence of `commit` on the context below.
 */
const PLUGIN = 'conformance.showcase'
const pluginRead = pin(
	describeQueryDefinition({
		id: 'conformance.showcase:query/read@1',
		timeoutMs: 1000,
		ports: { in: { sessionId: S.json }, out: { main: S.json } },
	}),
)
const pluginDecide = pin(
	describeTaskDefinition({
		id: 'conformance.showcase:task/decide@1',
		timeoutMs: 1000,
		ports: { in: { seen: S.json }, out: { main: S.json } },
	}),
)
const pluginAsk = pin(
	describeOracleDefinition({
		id: 'conformance.showcase:oracle/ask@1',
		shape: S.text,
		effects: 'external',
		review: { fields: [] },
		timeoutMs: 1000,
		slots: { connection: { kind: 'connection', quick: true, shape: S.text } },
		ports: { in: { prompt: S.json }, out: { main: S.json } },
	}),
)
const pluginPing = pin(
	describeOutletDefinition({
		id: 'conformance.showcase:outlet/ping@1',
		effects: 'emit',
		timeoutMs: 1000,
		ports: { in: { value: S.json }, out: { main: S.json } },
	}),
)

const pluginCtxDoc = compile(
	spec('conformance:plugin-ctx', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.query('read', ($) => pluginRead.v1({ sessionId: $.input.sessionScope }))
		.task('decide', ($) => pluginDecide.v1({ seen: $.read.main }))
		.oracle('ask', ($) => pluginAsk.v1({ prompt: $.decide.main, connection: slot.connection() }))
		.outlet('ping', ($) => pluginPing.v1({ value: $.ask.main }))
		.build(),
)

/**
 * The keys a plugin handler of each kind found on its `ctx` — recorded from a
 * real run rather than composed for the kit. The executor dispatches through
 * `pluginNodeBindings`, which is the path an install takes, and what C25 judges
 * is what came out the other side. Run once; the three kinds a document can
 * place are the three this host can answer for.
 */
let pluginCtx: Map<HookCtxKind, string[]> | undefined
const pluginCtxKeys = async (): Promise<Map<HookCtxKind, string[]>> => {
	if (pluginCtx) return pluginCtx
	const seen = new Map<HookCtxKind, string[]>()
	const record = (kind: HookCtxKind) => async (_input: unknown, ctx: PluginHandlerContext) => {
		seen.set(kind, Object.keys(ctx))
		return ok({ main: null })
	}
	const r = await run(pluginCtxDoc, {
		input: {},
		world,
		seed: 'seed:c25',
		bindings: {
			...bindings(),
			...pluginNodeBindings({
				pluginId: PLUGIN,
				handlers: {
					[pluginRead.id]: record('query'),
					[pluginDecide.id]: record('task'),
					[pluginAsk.id]: record('oracle'),
					[pluginPing.id]: record('outlet'),
				},
			}),
		},
	})
	assert.equal(r.outcome, 'ok', `the plugin ctx probe did not finish: ${r.haltReason ?? ''}`)
	pluginCtx = seen
	return seen
}

// ── C26's seam: how a frame is mounted ──────────────────────────────────────

/**
 * The mount both hosts use: core's `PluginFrame.svelte` and the preview
 * harness's `FrameStage.svelte` set the same sandbox attribute, and core serves
 * the document under the policy `frameCsp()` composes — `connect-src` carrying
 * only the hosts a package declared and an administrator left granted, which
 * for a package that declared none is `'none'`.
 */
const FRAME_CSP = [
	"default-src 'none'",
	"script-src 'self'",
	// The frame styles itself; inline is its own document's business.
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"media-src 'self' blob:",
	"connect-src 'none'",
	"form-action 'none'",
	"base-uri 'none'",
].join('; ')

/**
 * Which frame → host messages this host answers, probed rather than listed:
 * the port logs anything it does not know as *"not a protocol N message"*.
 * Both `invoke` and the deprecated `action` come back present — the harness
 * answers each — and that is the probe telling the truth about the host,
 * which is the point of asking the host at all (C19's lesson).
 */
const frameAccepts = (): string[] => {
	const ctx = {
		surfaceId: 'session-view',
		source: { messages: [{ id: 1, channel: 'main', content: 'hello' }] },
		state: frameStateStore(),
	}
	const sample: Record<string, Record<string, unknown>> = {
		action: { fn: 'extend' },
		invoke: { key: 'extend' },
		error: { message: 'boom' },
		request: { requestId: 'r1', what: 'messages' },
		'save-state': { state: { tab: 'board' } },
		commit: { payload: {} },
		'create-message': { text: 'x' },
	}
	return [
		'ready',
		'action',
		'invoke',
		'error',
		'request',
		'save-state',
		'commit',
		'create-message',
	].filter((t) => {
		const reply = answerFrameMessage({ t, ...(sample[t] ?? {}) }, ctx)
		return !!reply && !/not a protocol/.test(reply.log.detail)
	})
}

// ── C27's seam: the SDK's own doors ─────────────────────────────────────────

/** The refusal a synchronous door threw, or null when it accepted. */
const thrown = (door: () => unknown): string | null => {
	try {
		door()
		return null
	} catch (e) {
		return (e as Error).message
	}
}

/** The slug or key a verdict's `where` names — the field the door is asked about. */
const named = (where: string, shape: RegExp): string => shape.exec(where)?.[1] ?? 'x'

let doorN = 0
/** A fresh spec id per document built at a door. */
const doorSpec = () => `conformance:doors-${doorN++}`

/**
 * A provisional oracle — declared, not bound (R-2) — the `validate` and
 * `run` doors place under the node key the verdict's input names.
 */
const pendingOracle = pin(
	describeOracleDefinition({
		id: 'conformance:oracle/pending@1',
		effects: 'external',
		review: { fields: [] },
		timeoutMs: 1000,
		provisional: true,
		ports: { in: { text: S.text }, out: { main: S.json } },
	}),
)

/** A one-write document placing `pendingOracle` under `nodeKey`. */
const placingProvisional = (nodeKey: string): SpecDocument =>
	compile(
		spec(doorSpec(), { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle(nodeKey, ($) => pendingOracle.v1({ text: $.input.text }))
			.build(),
	)

/** The action a `venue` or `actor` input describes, under the key its `where` names. */
const crossingAction = (f: Extract<EffectsLineInput, { kind: 'venue' | 'actor' }>) => {
	const key = named(f.where, /\[([a-z0-9-]+)\]$/)
	return f.kind === 'venue'
		? action({ key, function: key, label: { en: 'Grant' }, effects: f.effects, venue: { kind: f.venue } })
		: action({
				key,
				function: key,
				label: { en: 'Grant' },
				effects: f.effects,
				audience: { see: ['participant'], act: [f.ref] },
			})
}

/**
 * Each entry drives the SDK's REAL door with the verdict's failing input and
 * answers what it refused with — the builder, `register()`, `validate()` and
 * the executor; never the verdict itself, which any host would pass. The
 * doors only a product has (`publish`, `fire`, `write`, `list`) are the app
 * host's (plans/31 V5); C27 names them as not judged here, as it names the
 * one verdict a door the SDK has does not hear (R-2's publication half at
 * `register()`, which never judges what a host can run — `undefined`).
 * `action` and `patchedActions` are read at call time — they are declared
 * below `sdk`.
 */
const doors: NonNullable<HostUnderTest['doors']> = {
	construction: (id, failing) => {
		switch (id) {
			case 'core:verdict/i18n': {
				const { value, where } = failing as DisplayTextInput
				const slug = named(where, /^presets\[([a-z0-9-]+)\]\.label$/)
				return thrown(() =>
					spec(doorSpec(), { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.preset(slug, { label: value as never }, () => {}),
				)
			}
			case 'core:verdict/effects-line': {
				const f = failing as EffectsLineInput
				if (f.kind !== 'venue' && f.kind !== 'actor') return undefined
				return thrown(() =>
					spec(doorSpec(), { version: '1.0.0', contributes: { actions: [crossingAction(f)] as any } })
						.inlet('input', C.userMessage.v1())
						.build(),
				)
			}
			default:
				return undefined
		}
	},
	registry: (id, failing) => {
		switch (id) {
			case 'core:verdict/i18n': {
				const { value } = failing as DisplayTextInput
				return thrown(() =>
					describeTaskDefinition({
						id: `conformance.doors:task/named-${doorN++}@1`,
						i18n: { name: value as never },
						ports: { in: { main: S.text }, out: { main: S.text } },
					}),
				)
			}
			case 'core:verdict/settings-travel': {
				const f = failing as SettingsTravelInput
				if (f.kind !== 'port') return undefined
				return thrown(() =>
					describeTaskDefinition({
						id: f.definitionId,
						ports: { in: { main: S.text }, out: { main: S.text, [f.port]: S.text } },
					}),
				)
			}
			default:
				return undefined
		}
	},
	validate: (id, failing) => {
		const first = (doc: SpecDocument, law: string): string | null =>
			validate(doc).find((f) => f.severity === 'error' && f.law === law)?.message ?? null
		switch (id) {
			case 'core:verdict/i18n': {
				const { value, where } = failing as DisplayTextInput
				const slug = named(where, /^presets\[([a-z0-9-]+)\]\.label$/)
				const d = compile(
					spec(doorSpec(), { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
						.preset(slug, { label: 'Sound' }, () => {})
						.build(),
				)
				return first({ ...d, presets: [{ ...d.presets[0]!, label: value as never }] }, 'R-20')
			}
			case 'core:verdict/settings-travel': {
				const f = failing as SettingsTravelInput
				if (f.kind === 'port') return undefined
				const owner = f.kind === 'edge' ? f.from : f.target
				const reader = f.kind === 'edge' ? f.to : f.node
				const port = f.kind === 'edge' ? f.toPort : f.key
				const wired =
					f.kind === 'edge' ? $ref(f.from, f.fromPort) : { __ref: 'slot', slot: f.slot, ofNode: f.target }
				const doc = compile(
					spec(doorSpec(), { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.outlet(owner, ($) => C.createMessage.v1({ text: $.input.text }))
						.task(reader, () => C.passthrough.v1({ [port]: wired } as any))
						.build(),
				)
				return first(doc, 'F39')
			}
			case 'core:verdict/provisional': {
				const f = failing as ProvisionalInput
				if (f.kind !== 'placement') return undefined
				return first(placingProvisional(f.nodeKey), 'R-2')
			}
			case 'core:verdict/effects-line': {
				const f = failing as EffectsLineInput
				if (f.kind !== 'venue' && f.kind !== 'actor') return undefined
				return first(patchedActions(doorSpec(), [crossingAction(f)]), 'F41')
			}
			default:
				return undefined
		}
	},
	run: async (id, failing) => {
		switch (id) {
			case 'core:verdict/i18n': {
				const { value } = failing as DisplayTextInput
				const doc = compile(
					spec(doorSpec(), { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.task('probe', ($) => C.passthrough.v1({ main: $.input.text }))
						.build(),
				)
				const r = await run(doc, {
					input: { text: 'hi', sessionScope: 'session:1' },
					world,
					bindings: bindings({
						'test:task/passthrough@1': async (i: any, ctx: any) => {
							ctx.status({ i18n: value })
							return ok({ main: i.main })
						},
					}),
				})
				return (
					r.nodes.find((n) => n.nodeKey === 'probe')?.notes?.find((n) => n.startsWith('status ignored')) ??
					null
				)
			}
			case 'core:verdict/settings-travel': {
				const f = failing as SettingsTravelInput
				if (f.kind !== 'reference') return undefined
				const doc = compile(
					spec(doorSpec(), { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.outlet(f.target, ($) => C.createMessage.v1({ text: $.input.text }))
						.task(f.node, () =>
							C.gate.v1({ [f.key]: { __ref: 'slot', slot: f.slot, ofNode: f.target } } as any),
						)
						.build(),
				)
				const r = await run(doc, {
					input: {},
					world,
					bindings: bindings({ 'test:task/gate@1': async () => ok({ main: 'probed' }) }),
				})
				return r.nodes.find((n) => n.nodeKey === f.node)?.notes?.find((n) => n.startsWith('F39')) ?? null
			}
			case 'core:verdict/provisional': {
				const f = failing as ProvisionalInput
				if (f.kind !== 'placement') return undefined
				const r = await run(placingProvisional(f.nodeKey), {
					input: { text: 'x' },
					world,
					bindings: bindings({ 'conformance:oracle/pending@1': async () => ok({ main: 'never' }) }),
				})
				return r.outcome === 'err' ? (r.haltReason ?? null) : null
			}
			default:
				return undefined
		}
	},
}

const sdk: HostUnderTest = {
	name: '@serene-pub/sdk reference executor',
	validate,
	run,
	replay,
	canonicalHash,
	importDocument,
	listActions,
	doors,
	// What this host ships (C24): core's catalogue, read off the announcement
	// the app seeds from — the same object `forms.test.ts` holds to the rule.
	shipped: () => {
		const { document } = coreAnnouncement()
		return { genres: document.genres, presets: document.presets }
	},
	hookCtxKeys: async (kind) => (await pluginCtxKeys()).get(kind),
	frameMount: () => ({ sandbox: 'allow-scripts', csp: FRAME_CSP, accepts: frameAccepts() }),
	// C30: the SDK's own harness is its reference mount.
	mountComponent: mountCode,
}

const CHAT = 'core:genre/chat'

/** A contributed action under the `conformance` namespace, in the composer unless told otherwise. */
const action = (over: Record<string, unknown> = {}) => ({
	key: 'roll',
	venue: { kind: 'composer' },
	label: { en: 'Roll' },
	description: { en: 'What the roll action does.' },
	...over,
})

/** A one-write spec that contributes `actions` — the shape a plugin's action spec has. */
const actionsDoc = (id: string, actions: Array<Record<string, unknown>>) =>
	compile(
		spec(id, { version: '1.0.0', contributes: { actions: actions as any } })
			// Actions are offered to the genre of the lock (R48).
			.inlet('input', C.userMessage.v1(), { genre: use(CHAT), event: sessionEvents.sessionAction })
			.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
			.build(),
	)

/**
 * The builder refuses a `world` action across the line at construction, so
 * the effects-line fixtures are a sound document patched after compile — an
 * import, a hand-written JSON — which is exactly the door `validate()` guards.
 */
const patchedActions = (id: string, actions: Array<Record<string, unknown>>) => {
	const doc = actionsDoc(id, [action()])
	// A stored document's actions carry the genre the builder copied in.
	return { ...doc, contributes: { actions: actions.map((a) => ({ genre: CHAT, ...a })) } }
}

const fixtures: Fixtures = {
	world,
	// The kit's fixtures decide their own behaviour: `gate` halts (so the halt and
	// compaction requirements have something to observe) and the loop step stays truthy
	// (so the ceiling requirement actually reaches the ceiling).
	bindings: (over = {}) =>
		bindings({
			'test:task/gate@1': async () => halt('this chat type is not applicable'),
			'test:task/passthrough@1': async () => ok({ main: true }),
			...over,
		}),

	chatTurn: () =>
		compile(
			spec('conformance:chat-turn', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				// The data flow the docblock promises — input → query → task →
				// provider → write — so C4 and C5 exercise a task with upstream
				// data, not one that runs on its defaults (U7 review, W5).
				.task('prompt', ($) => C.assemble.v2({ messages: $.history.messages }))
				.oracle('generate', ($) =>
					C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
				)
				// Opened live (F7, W1): the run's one live row, which C16
				// holds the host to naming.
				.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text, generating: true }))
				.build(),
		),

	haltsEarly: () =>
		compile(
			spec('conformance:halts', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('gate', ($) => C.gate.v1({ main: $.input.main }))
				.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
				.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))
				.build(),
		),

	// W1b — a parallel gather whose first chain finishes last, both writing:
	// C8 holds the host to committing them in declaration order anyway.
	gatherWrites: () =>
		compile(
			spec('conformance:gather-writes', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.gather('g', { mode: 'parallel' }, (b) =>
					b
						.chain('slow', (c) =>
							c
								.task('think', () => T.delay.v1({ ms: 80 } as never))
								.outlet('save', () => T.savePluginData.v1({ value: 'slow' } as never)),
						)
						.chain('fast', (c) => c.outlet('save', () => T.savePluginData.v1({ value: 'fast' } as never))),
				)
				.build(),
		),

	gather: () =>
		compile(
			spec('conformance:gather', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.gather('gather', { mode: 'parallel' }, (b) =>
					b
						.chain('history', (c) =>
							c.query('history', ($) =>
								C.sessionHistory.v1({ scope: $.input.sessionScope }),
							),
						)
						.chain('keyword', (c) =>
							c.query('triggers', ($) =>
								C.lorebookTriggers.v1({ text: $.input.text }),
							),
						)
						.chain('persona', (c) =>
							c.query('card', ($) => T.personaCard.v1({ characterId: $.input.main })),
						),
				)
				.build(),
		),

	mapped: () =>
		compile(
			spec('conformance:mapped', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('chunks', ($) => T.chunkText.v1({ text: $.input.text }))
				.each('summarize', { over: ($) => $.chunks.items, max: 8 }, (m) =>
					m.oracle('sum', C.generateText.v1({ connection: slot.connection() })),
				)
				.build(),
		),

	looped: (max: number) =>
		compile(
			spec('conformance:looped', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.loop('again', { repeatWhile: ($: any) => $.again.item.step.main, max }, (l) =>
					l.task('step', C.passthrough.v1({})),
				)
				.build(),
		),

	// F37 — two independent live-row writes, refused at publish by F7: C16(a)
	// holds the host to the refusal; the run half is proved on `chatTurn`.
	twoWrites: () =>
		compile(
			spec('conformance:two-writes', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('first', () => C.createMessage.v1({ text: '', generating: true }))
				.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
				.outlet('second', () => C.createMessage.v1({ text: '', generating: true, channel: 'aside' as never }))
				.build(),
		),

	// 01 §4 — a live row inside a repeat, which C21 holds the validator to
	// (W1: other writes may repeat; the reply row may not).
	writeInClause: () =>
		compile(
			spec('conformance:write-in-clause', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.each('reads', { over: [1, 2], max: 4 }, (c) =>
					c.outlet('save', C.createMessage.v1({ text: '', generating: true })),
				)
				.build(),
		),

	// F41's runtime half — a sound document contributing a `world` action in
	// the composer, the venue the effects line puts it in. C23 names its
	// function in a `choices` block, which is the shape no document carries and
	// the host therefore refuses at the write.
	worldAction: () =>
		patchedActions('conformance:world-in-composer', [
			action({ key: 'grant', label: { en: 'Grant' }, effects: 'world' }),
		]),

	actions: () =>
		actionsDoc('conformance:actions', [
			// quick → the composer's primary set; slash derived: /conformance.roll
			action({ quick: true }),
			// not quick → the overflow only; a declared slash name
			action({
				key: 'whisper',
				label: { en: 'Whisper' },
				slash: 'conformance.whisper',
			}),
			// on a named channel: listed on 'phone', never on 'main'
			action({
				key: 'page',
				label: { en: 'Page' },
				venue: { kind: 'composer', channel: 'phone' },
			}),
			// a core verb's function under a plugin key — an alternative for
			// `continue` (19 §3), in two venues; /conformance.continue-story
			action({
				key: 'continue-story',
				label: { en: 'Continue the story' },
				venue: [{ kind: 'message' }, { kind: 'composer' }],
				quick: true,
			}),
		]),

	invalid: () => [
		{
			law: 'F39',
			because:
				"a data edge from 'save.settings.review' into a downstream task — a setting is read at its owner; the task should read a port 'save' publishes",
			doc: compile(
				spec('conformance:settings-travel', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
					.task('probe', () =>
						C.passthrough.v1({ main: $ref('save', 'settings.review') }),
					)
					.build(),
			),
		},
		{
			law: 'F39',
			because:
				"a data edge from the whole of 'save.settings' — the substrate's switches are never a value; declare what the task needs on its own params",
			doc: compile(
				spec('conformance:settings-travel-whole', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
					.task('probe', () => C.passthrough.v1({ main: $ref('save', 'settings') }))
					.build(),
			),
		},
		{
			law: 'F39',
			because:
				"a hand-written config reference { __ref: 'slot', slot: 'settings', ofNode: 'save' } — the other door to the same switches; read a port 'save' publishes instead",
			doc: compile(
				spec('conformance:settings-travel-ref', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
					.task('probe', () =>
						C.passthrough.v1({
							main: { __ref: 'slot', slot: 'settings', ofNode: 'save' } as any,
						}),
					)
					.build(),
			),
		},
		{
			law: 'F41',
			because:
				// Was the message venue until 2026-09-28: a row's ⋮ is the owner's
				// own button since lair re-plan R11 (File as a room), so the
				// venue half of the line is judged on a widget's.
				"a 'world' action in the widget venue — an out-of-fiction effect belongs in the composer, a message's own menu, session settings, admin or review, never where a widget could invoke it or a character could be asked to press it",
			doc: patchedActions('conformance:world-in-widget', [
				action({
					key: 'grant',
					label: { en: 'Grant' },
					venue: { kind: 'widget' },
					effects: 'world',
				}),
			]),
		},
		{
			law: 'F41',
			because:
				"a 'world' action whose act audience names 'participant' — an out-of-fiction effect is the owner's or an administrator's to invoke",
			doc: patchedActions('conformance:world-by-participant', [
				action({
					key: 'grant',
					label: { en: 'Grant' },
					effects: 'world',
					audience: { see: ['participant'], act: ['participant'] },
				}),
			]),
		},
		{
			law: 'F41',
			because:
				"a 'world' action in the 'form' venue — the one venue a block reaches, so a block could put an out-of-fiction button in front of whoever is answering the form; the composer, session settings, admin and review are where it belongs",
			doc: patchedActions('conformance:world-by-form', [
				action({
					key: 'grant',
					label: { en: 'Grant' },
					venue: { kind: 'form' },
					effects: 'world',
				}),
			]),
		},
		{
			law: 'R-20',
			because:
				"an author preset whose label is '' — display text is a string or a locale map with 'en', never blank; the builder refuses this at .preset(), and a stored document gets the same sentence",
			doc: (() => {
				const d = compile(
					spec('conformance:blank-label', { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
						.preset('lore', { label: 'Lore-heavy' }, () => {})
						.build(),
				)
				return { ...d, presets: [{ ...d.presets[0]!, label: '' }] }
			})(),
		},
		{
			law: '01 §2',
			because: 'no Input at all',
			doc: {
				...compile(spec('conformance:noinput', { version: '1.0.0' }).build()),
				nodes: [],
			},
		},
		{
			law: 'F7',
			because: 'two live rows',
			doc: compile(
				spec('conformance:twowrites', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.outlet('a', C.createMessage.v1({ text: '', generating: true }))
					.outlet('b', C.createMessage.v1({ text: '', generating: true }))
					.build(),
			),
		},
		{
			law: '01 §4',
			because: 'an unbounded map',
			doc: compile(
				spec('conformance:unbounded', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.task('chunks', ($) => T.chunkText.v1({ text: $.input.text }))
					.each('m', { over: ($) => $.chunks.items, max: 0 }, (m) =>
						m.task('t', C.gate.v1({})),
					)
					.build(),
			),
		},
		{
			law: '01 §4a',
			because: 'a loop predicate computed outside its body',
			doc: compile(
				spec('conformance:badloop', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.task('outside', C.gate.v1({}))
					.loop('l', { repeatWhile: ($: any) => $.outside.main, max: 4 }, (l) =>
						l.task('t', C.passthrough.v1({})),
					)
					.build(),
			),
		},
		{
			law: 'F8',
			because: 'a node declaring emits',
			doc: (() => {
				const d = compile(
					spec('conformance:emits', { version: '1.0.0' })
						.inlet('input', C.userMessage.v1())
						.task('t', C.gate.v1({}))
						.build(),
				)
				d.nodes[1]!.config = { ...d.nodes[1]!.config, emits: 'core:event/anything@1' }
				return d
			})(),
		},
	],
}

test('95 · the reference implementation passes its own conformance kit', async () => {
	const results = await conform(sdk, fixtures)
	const failed = results.filter((r) => !r.pass)
	assert.deepEqual(failed, [], renderConformance(results))
	assert.equal(results.length, REQUIREMENTS.length)
	if (process.env.SHOW_CONFORMANCE) console.log(renderConformance(results))
})

test('95a · every requirement says what breaks, not just which law', async () => {
	// A red line reading "F13" tells an implementer nothing about where to look. The
	// consequence is the part that makes a failure actionable at 2am during a port.
	for (const r of REQUIREMENTS) {
		assert.ok(r.consequence.length > 40, `${r.id} has no usable consequence`)
		assert.ok(r.law.length > 0)
	}
})

test('95b · a host that gets a law wrong fails the kit, loudly', async () => {
	// Proves the kit has teeth. A host whose halt is an error passes nothing that
	// depends on halt being success.
	const brokenHalt: HostUnderTest = {
		...sdk,
		run: async (doc, opts) => {
			const r = await run(doc, opts)
			return r.outcome === 'halt' ? { ...r, outcome: 'err' } : r
		},
	}
	const results = await conform(brokenHalt, fixtures)
	const c3 = results.find((r) => r.id === 'C3')!
	assert.equal(c3.pass, false)
	assert.match(c3.consequence!, /counted as an error/)
})

test('95c · the five new laws (F37–F41) each fail on a host that gets them wrong', async () => {
	const result = async (host: HostUnderTest, id: string) =>
		(await conform(host, fixtures)).find((x) => x.id === id)!
	const failing = async (host: HostUnderTest, id: string) => {
		const r = await result(host, id)
		assert.equal(r.pass, false, `${id} passed on a host that breaks it`)
		return r.error!
	}
	const wrapHooks = (
		b: Parameters<typeof run>[1]['bindings'],
		wrap: (hook: (i: any, ctx: any) => any) => (i: any, ctx: any) => any,
	) => Object.fromEntries(Object.entries(b).map(([id, hook]) => [id, wrap(hook)]))

	// F37 — a validator that lost F7 lets two primary rows reach the executor.
	const twoRows: HostUnderTest = {
		...sdk,
		validate: (doc) => validate(doc).filter((f) => f.law !== 'F7'),
	}
	assert.match(await failing(twoRows, 'C16'), /raised no F7 error/)

	// F37 — a host that never tells the host the run ended names no primary row.
	const silentEnd: HostUnderTest = {
		...sdk,
		run: (doc, opts) => run(doc, { ...opts, onRunEnd: undefined }),
	}
	assert.match(await failing(silentEnd, 'C16'), /heard the run end 0 times/)

	// F37 — a host that names some other row as the run's.
	const strangersRow: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				onRunEnd: opts.onRunEnd
					? (end) => opts.onRunEnd!({ ...end, liveRow: 'row:somebody-elses' })
					: undefined,
			}),
	}
	assert.match(await failing(strangersRow, 'C16'), /is not the write's/)

	// F38 — a host that ignores `dry` writes on a preview.
	const wetPreview: HostUnderTest = {
		...sdk,
		run: (doc, opts) => run(doc, { ...opts, dry: false }),
	}
	assert.match(await failing(wetPreview, 'C17'), /dry run reached the world: 1 write/)
	assert.match(await failing(wetPreview, 'C16'), /did not tell the host it was dry/)

	// F37/F38 — the two write channels (U7 delta review, 2). A row count that
	// never moves beside a probe that sees every commit — the shape of a host
	// routing `ctx.commit` through `RunOptions.host` — must not shadow the
	// probe; a host writing its own rows, counted by the fixture, is seen
	// through the count; with neither showing a write, the gap is named and
	// the "no writesSeen" sentence appears only when there is none.
	const unmoving: Fixtures = { ...fixtures, writesSeen: () => 0 }
	for (const id of ['C16', 'C17']) {
		const r = (await conform(sdk, unmoving)).find((x) => x.id === id)!
		assert.equal(r.pass, true, `${id}: ${r.error}`)
	}
	let rows = 0
	const ownStore: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				host: {
					commit: async (_p, n) => {
						rows++
						return { id: `db:${n.key}#${rows}` }
					},
				},
			}),
	}
	const counted: Fixtures = { ...fixtures, writesSeen: () => rows }
	for (const id of ['C16', 'C17']) {
		const r = (await conform(ownStore, counted)).find((x) => x.id === id)!
		assert.equal(r.pass, true, `${id}: ${r.error}`)
	}
	assert.ok(rows > 0, 'the counted host wrote through its own store')
	const invisible: HostUnderTest = {
		...sdk,
		run: (doc, opts) => run(doc, { ...opts, host: undefined }),
	}
	for (const id of ['C16', 'C17']) {
		const r = (await conform(invisible, fixtures)).find((x) => x.id === id)!
		assert.equal(r.pass, false, `${id} passed with no write channel`)
		assert.match(r.error!, /the fixtures supply no writesSeen\(\)/)
		const r2 = (await conform(invisible, unmoving)).find((x) => x.id === id)!
		assert.equal(r2.pass, false)
		assert.match(r2.error!, /writesSeen\(\) moved by 0/)
		assert.doesNotMatch(r2.error!, /supply no writesSeen/)
	}

	// F38 — a host that drops the event a dry write would have caused.
	const droppedEvent: HostUnderTest = {
		...sdk,
		run: async (doc, opts) => {
			const r = await run(doc, opts)
			return opts.dry ? { ...r, emitted: [] } : r
		},
	}
	assert.match(await failing(droppedEvent, 'C17'), /dry write caused no recorded event/)

	// F39 — a validator that lost the rule.
	const settingsTravel: HostUnderTest = {
		...sdk,
		validate: (doc) => validate(doc).filter((f) => f.law !== 'F39'),
	}
	assert.match(await failing(settingsTravel, 'C18'), /raised no F39 error/)

	// F39 — a host that ignores `world.overrides` never gets to pass on a leak
	// it could not have made: the owner's own switch was never read (U7 delta
	// review, 1).
	const ignoresOverrides: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, { ...opts, world: opts.world ? { ...opts.world, overrides: [] } : opts.world }),
	}
	assert.match(
		await failing(ignoresOverrides, 'C18'),
		/the owner never received its own switch: 'review' was set to 'on' at 'save\.settings'.*asked for: nobody/,
	)

	// F39 — a host that hands every hook the owner's DECLARED switches only
	// (no stray key to catch): the switch's value gives it away.
	const leaksDeclared: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				bindings: wrapHooks(
					opts.bindings,
					(hook) => (i, ctx) => hook(i, { ...ctx, settingsOf: { save: { review: 'on', enabled: true } } }),
				),
			}),
	}
	assert.match(
		await failing(leaksDeclared, 'C18'),
		/the owner's declared switch \('save\.settings\.review' = 'on'\) is readable from the ctx handed to/,
	)

	// F39 — an executor that resolves a data edge from the settings address
	// to the switch's value: the declared value arrives on a port.
	const resolvesEdge: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				bindings: wrapHooks(opts.bindings, (hook) => (i, ctx) => hook({ ...i, main: 'on' }, ctx)),
			}),
	}
	assert.match(
		await failing(resolvesEdge, 'C18'),
		/the owner's declared switch \('save\.settings\.review' = 'on'\) arrived in the input of .* — a data edge from a settings address must deliver nothing/,
	)

	// F39 — an executor that hands every hook another node's switches in its
	// ctx: the planted setting is readable there, and the failure names the
	// accessor-shaped key as a hint.
	const leakyCtx: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				bindings: wrapHooks(
					opts.bindings,
					(hook) => (i, ctx) =>
						hook(i, { ...ctx, settingsOf: { save: { probe: 'F39-must-not-travel' } } }),
				),
			}),
	}
	const leaked = await failing(leakyCtx, 'C18')
	assert.match(leaked, /readable from the ctx handed to/)
	assert.match(leaked, /worth a look: settingsOf/)
	// …and one that hands it over as data.
	const leakyInput: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				bindings: wrapHooks(
					opts.bindings,
					(hook) => (i, ctx) =>
						hook({ ...i, main: { probe: 'F39-must-not-travel' } }, ctx),
				),
			}),
	}
	assert.match(await failing(leakyInput, 'C18'), /settings travelled as data/)

	// F39 — a host sound on published documents that leaks only on one it
	// should have refused: the failure says up front that the document was
	// run unvalidated on purpose, before the finding (U7 review, W1).
	const leaksUnvalidated: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				bindings: validate(doc).some((f) => f.law === 'F39')
					? wrapHooks(
							opts.bindings,
							(hook) => (i, ctx) => hook({ ...i, main: { probe: 'F39-must-not-travel' } }, ctx),
						)
					: opts.bindings,
			}),
	}
	assert.match(
		await failing(leaksUnvalidated, 'C18'),
		/^C18\(b\) runs a document validate\(\) refuses, on purpose — .*needs a run seam that skips publish-time validation: a setting planted at 'save\.settings' arrived in the input of .* in 'conformance:settings-travel' — settings travelled as data/,
	)

	// F39 — a ctx key that merely SOUNDS like an accessor is not a finding
	// (U7 review, S4): a host naming its resolved sampling `configuredSampling`
	// passes, because nothing planted travels through it.
	const soundsLikeOne: HostUnderTest = {
		...sdk,
		run: (doc, opts) =>
			run(doc, {
				...opts,
				bindings: wrapHooks(
					opts.bindings,
					(hook) => (i, ctx) => hook(i, { ...ctx, configuredSampling: { temperature: 0.7 } }),
				),
			}),
	}
	assert.equal((await result(soundsLikeOne, 'C18')).pass, true)

	// F39 — a host that validates before it runs cannot be judged on the
	// unvalidated half: skipped with the reason on the result, not failed.
	const validatesFirst: HostUnderTest = {
		...sdk,
		run: (doc, opts) => {
			assertValid(doc)
			return run(doc, opts)
		},
	}
	const judged = await result(validatesFirst, 'C18')
	assert.equal(judged.pass, true, judged.error)
	assert.equal(judged.skipped?.length, 3, 'one skip per refused F39 document')
	for (const why of judged.skipped!) {
		assert.match(why, /refused to run it \(spec validation failed/)
		assert.match(why, /needs a run seam that skips publish-time validation/)
	}
	assert.match(renderConformance([judged]), /~ not judged: C18\(b\) on 'conformance:settings-travel'/)
	if (process.env.SHOW_CONFORMANCE) console.log(renderConformance([judged]))

	// F40 — a host without the listing seam is not judged, and told so.
	const noSeam: HostUnderTest = { ...sdk, listActions: undefined }
	assert.match(await failing(noSeam, 'C19'), /supplies no `listActions` seam — C19 cannot be judged/)

	// F40 — hosts whose own listing gets placement wrong. Each starts from the
	// SDK host's projection and breaks one thing.
	const withListing = (f: (l: VenueListing<ListedAction>) => VenueListing<ListedAction>): HostUnderTest => ({
		...sdk,
		listActions: (doc, channel) =>
			Object.fromEntries(
				Object.entries(listActions(doc, channel)).map(([k, l]) => [k, f(l)]),
			) as VenueListings<ListedAction>,
	})
	const withEntries = (f: (e: ListedAction) => ListedAction) =>
		withListing((l) => ({ primary: l.primary.map(f), overflow: l.overflow.map(f) }))

	// …drops everything that is not quick (prominence became availability).
	const dropsOverflow = withListing((l) => ({ primary: l.primary, overflow: [] }))
	assert.match(
		await failing(dropsOverflow, 'C19'),
		/'whisper' appears 0 time\(s\) in the 'composer' venue on 'main' — every enabled action is listed exactly once/,
	)
	// …lists an action twice.
	const listsTwice = withListing((l) => ({ primary: [...l.primary, ...l.primary], overflow: l.overflow }))
	assert.match(await failing(listsTwice, 'C19'), /'roll' appears 2 time\(s\) in the 'composer' venue on 'main'/)
	// …ignores the channel a venue was declared for.
	const phoneOnMain: HostUnderTest = {
		...sdk,
		listActions: (doc, channel) =>
			listActions(
				{
					...doc,
					contributes: {
						actions: actionsOf(doc).map((a) => ({ ...a, venue: a.venue.map(({ kind }) => ({ kind })) })),
					},
				},
				channel,
			),
	}
	assert.match(
		await failing(phoneOnMain, 'C19'),
		/'page' is declared for channel 'phone' but the host listed it in 'composer' on 'main'/,
	)
	// …calls a plugin's action by a bare name its spec may not claim.
	const bareSlash = withEntries((e) => ({ ...e, slash: e.key }))
	assert.match(await failing(bareSlash, 'C19'), /under '\/roll', which its spec may not claim/)
	// …lists a derived name that is not the derived name.
	const renamedDerived = withEntries((e) => (e.key === 'roll' ? { ...e, slash: 'conformance.dice' } : e))
	assert.match(
		await failing(renamedDerived, 'C19'),
		/'roll' declares no slash name, so it is called by the derived one '\/conformance.roll' — the host lists it under '\/conformance.dice'/,
	)
	// …lists a declared name under some other name.
	const renamedDeclared = withEntries((e) => (e.key === 'whisper' ? { ...e, slash: 'conformance.hush' } : e))
	assert.match(
		await failing(renamedDeclared, 'C19'),
		/'whisper' declares the slash name '\/conformance.whisper' but the host lists it under '\/conformance.hush'/,
	)
	// …lists a composer action with no slash name at all.
	const noSlash = withEntries(({ slash: _slash, ...e }) => e)
	assert.match(await failing(noSlash, 'C19'), /'roll' with no slash name — it is unreachable by \//)

	// F40 — the kit also refuses a fixture that cannot exercise the law: every
	// action quick means no overflow to judge.
	const unreachable: Fixtures = {
		...fixtures,
		actions: () => {
			const doc = fixtures.actions()
			const actions = (doc.contributes as any).actions.map((a: any) => ({
				...a,
				quick: true,
			}))
			return { ...doc, contributes: { actions } }
		},
	}
	const r40 = (await conform(sdk, unreachable)).find((x) => x.id === 'C19')!
	assert.equal(r40.pass, false)
	assert.match(r40.error!, /needs one quick action and one that is not/)

	// F41 — a validator that lost the effects line, and one that still
	// refuses but under the wrong label.
	const noLine: HostUnderTest = {
		...sdk,
		validate: (doc) => validate(doc).filter((f) => f.law !== 'F41'),
	}
	assert.match(await failing(noLine, 'C20'), /raised no F41 error \(no errors at all\)/)
	const mislabelled: HostUnderTest = {
		...sdk,
		validate: (doc) => validate(doc).map((f) => (f.law === 'F41' ? { ...f, law: 'R-15' } : f)),
	}
	assert.match(await failing(mislabelled, 'C20'), /raised no F41 error \(R-15\)/)
})
test('95d · the six laws the showcase lanes hit each fail on a host that gets them wrong', async () => {
	// Same shape as 95c, for C21–C26 (plan §14 D-7): each law is stated by a
	// host that breaks exactly it, and by the sentence that comes back.
	const result = async (host: HostUnderTest, id: string, fx: Fixtures = fixtures) =>
		(await conform(host, fx)).find((x) => x.id === id)!
	const failing = async (host: HostUnderTest, id: string, fx: Fixtures = fixtures) => {
		const r = await result(host, id, fx)
		assert.equal(r.pass, false, `${id} passed on a host that breaks it`)
		return r.error!
	}
	const without = (law: string): HostUnderTest => ({
		...sdk,
		validate: (doc) => validate(doc).filter((f) => f.law !== law),
	})

	// C21 — a validator that lost 01 §4 lets a write live inside a clause,
	// where it runs once per item; one that refuses without a fix leaves the
	// author with a prohibition and no alternative.
	assert.match(await failing(without('01 §4'), 'C21'), /raised no '01 §4' error/)
	assert.match(await failing(without('F7'), 'C21'), /raised no F7 error/)
	const noFix: HostUnderTest = {
		...sdk,
		validate: (doc) => validate(doc).map((f) => (f.law === 'F7' ? { ...f, fix: '' } : f)),
	}
	assert.match(await failing(noFix, 'C21'), /without saying what to do instead/)
	// And the fixture's absence is a gap named, never a pass in silence.
	const noClauseDoc = await result(sdk, 'C21', { ...fixtures, writeInClause: undefined })
	assert.equal(noClauseDoc.pass, true)
	assert.match(noClauseDoc.skipped!.join(' '), /supply `writeInClause\(\)`/)

	// C22 — a validator that lost F8 lets a node name the event another
	// pipeline listens for, which is a trigger spelled sideways.
	assert.match(await failing(without('F8'), 'C22'), /raised no F8 error/)

	// C23 — the effects line at a block. The publish half: a validator that
	// lost F41 lets a `world` action be declared in the one venue a block
	// reaches.
	assert.match(await failing(without('F41'), 'C23'), /raised no F41 error/)
	// The block half: a document whose `world` action the kit can see, with no
	// world action at all, is a fixture that cannot prove anything — said so
	// rather than passed.
	const noWorld: Fixtures = {
		...fixtures,
		worldAction: () => fixtures.chatTurn(),
	}
	assert.match(await failing(sdk, 'C23', noWorld), /contributes no action with `effects: 'world'`/)

	// C24 — a host whose genre cannot be addressed by a form, and one whose
	// preset binds nothing to it. Both are a form that renders and answers to
	// nobody.
	const shipped = (await sdk.shipped!()) as { genres: any[]; presets: any[] }
	const EVENT = sessionEvents.formAddressed
	const noEvent: HostUnderTest = {
		...sdk,
		shipped: () => ({
			genres: shipped.genres.map((g) => ({
				...g,
				events: Object.fromEntries(Object.entries(g.events).filter(([k]) => k !== EVENT)),
			})),
			presets: shipped.presets,
		}),
	}
	assert.match(await failing(noEvent, 'C24'), /does not declare core:event\/form-addressed@1/)
	const noBinder: HostUnderTest = {
		...sdk,
		shipped: () => ({
			genres: shipped.genres,
			presets: shipped.presets.map((p) => ({
				...p,
				bindings: Object.fromEntries(
					Object.entries(p.bindings).filter(([k]) => k !== EVENT),
				),
			})),
		}),
	}
	assert.match(await failing(noBinder, 'C24'), /binds no pipeline to/)
	const noCatalogue = await result({ ...sdk, shipped: undefined }, 'C24')
	assert.equal(noCatalogue.pass, true)
	assert.match(noCatalogue.skipped!.join(' '), /supply `shipped\(\)`/)

	// C28 — core's shipped genres list only caused events and declared roots;
	// a genre listing an event nothing fires is refused.
	assert.equal((await result(sdk, 'C28')).pass, true)
	const uncaused: HostUnderTest = {
		...sdk,
		shipped: () => ({
			genres: shipped.genres.map((g) => ({
				...g,
				events: { ...g.events, 'core:event/message-stopped@1': {} },
			})),
			presets: shipped.presets,
		}),
	}
	assert.match(await failing(uncaused, 'C28'), /message-stopped@1', which no write causes and which is not a declared root/)
	const unknown: HostUnderTest = {
		...sdk,
		shipped: () => ({
			genres: [{ ...shipped.genres[0], events: { 'acme:event/nothing@1': {} } }],
			presets: [],
		}),
	}
	assert.match(await failing(unknown, 'C28'), /which no one declares/)

	// C29 — the turn loop: respond completes a message, the completion
	// recomputes the turn order, auto-advance asks for the next reply. With
	// auto-advance's termination policy it passes; without any, it is refused.
	const R = 'core:spec/respond'
	const T = 'core:spec/chat-turn-order'
	const AA = 'core:listener/auto-advance'
	const loop = {
		nodes: [
			{ id: sessionEvents.messageRespond, kind: 'event' as const },
			{ id: sessionEvents.messageCompleted, kind: 'event' as const },
			{ id: sessionEvents.turnOrderChanged, kind: 'event' as const },
			{ id: R, kind: 'spec' as const },
			{ id: T, kind: 'spec' as const },
			{ id: AA, kind: 'listener' as const },
		],
		edges: [
			{ from: sessionEvents.messageRespond, to: R, kind: 'binds' as const },
			{ from: R, to: sessionEvents.messageCompleted, kind: 'causes' as const },
			{ from: sessionEvents.messageCompleted, to: T, kind: 'binds' as const },
			{ from: T, to: sessionEvents.turnOrderChanged, kind: 'causes' as const },
			{ from: sessionEvents.turnOrderChanged, to: AA, kind: 'listens' as const },
			{ from: AA, to: sessionEvents.messageRespond, kind: 'causes' as const },
		],
	}
	const braked: HostUnderTest = {
		...sdk,
		eventMap: () => ({ ...loop, terminations: { [AA]: 'cause rule, and a cap on replies in a row' } }),
	}
	assert.equal((await result(braked, 'C29')).pass, true)
	const runaway: HostUnderTest = { ...sdk, eventMap: () => ({ ...loop, terminations: {} }) }
	assert.match(await failing(runaway, 'C29'), /has no termination policy/)
	const noMap = await result(sdk, 'C29')
	assert.equal(noMap.pass, true)
	assert.match(noMap.skipped!.join(' '), /supply both/)

	// C25 — the grant table. A task that was handed storage is not pure; an
	// outlet that was handed `commit` is a plugin write-class outlet by
	// another name.
	const impure: HostUnderTest = {
		...sdk,
		hookCtxKeys: async (kind) =>
			kind === 'task' ? ['random', 'now', 'log', 'storage', 'signal'] : sdk.hookCtxKeys!(kind),
	}
	assert.match(await failing(impure, 'C25'), /is handed \[random, now, log, storage, signal\]/)
	const commits: HostUnderTest = {
		...sdk,
		hookCtxKeys: async (kind) =>
			kind === 'outlet'
				? ['random', 'now', 'log', 'storage', 'commit', 'signal']
				: sdk.hookCtxKeys!(kind),
	}
	assert.match(await failing(commits, 'C25'), /outlet hook is handed 'commit'/)
	assert.match(await failing(commits, 'C25'), /E_PLUGIN_WRITE_OUTLET/)
	const noPluginSurface = await result({ ...sdk, hookCtxKeys: undefined }, 'C25')
	assert.equal(noPluginSurface.pass, true, noPluginSurface.error)
	assert.match(noPluginSurface.skipped!.join(' '), /supply `hookCtxKeys\(kind\)`/)

	// C26 — the frame boundary, one string at a time.
	const mount = await sdk.frameMount!()
	const mounted = (over: Partial<typeof mount>): HostUnderTest => ({
		...sdk,
		frameMount: () => ({ ...mount, ...over }),
	})
	assert.match(
		await failing(mounted({ sandbox: 'allow-scripts allow-same-origin' }), 'C26'),
		/allow-same-origin gives the document the host/,
	)
	assert.match(
		await failing(mounted({ sandbox: 'allow-scripts allow-forms' }), 'C26'),
		/allow-forms lets a submit leave the frame/,
	)
	assert.match(await failing(mounted({ sandbox: '' }), 'C26'), /the surface is a still image/)
	assert.match(
		await failing(mounted({ csp: mount.csp.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") }), 'C26'),
		/an inline <script> is the first thing a frame document reaches for/,
	)
	assert.match(
		await failing(mounted({ csp: mount.csp.replace("img-src 'self' data: blob:", 'img-src https://cdn.example.com') }), 'C26'),
		/a frame's resources come from the package's own files/,
	)
	assert.match(
		await failing(mounted({ csp: mount.csp.replace("form-action 'none'", "form-action 'self'") }), 'C26'),
		/a frame fires actions through the port it was handed/,
	)
	assert.match(
		await failing(mounted({ csp: mount.csp.replace("default-src 'none'; ", '') }), 'C26'),
		/with no default-src there is no floor/,
	)
	assert.match(
		await failing(mounted({ csp: `${mount.csp}; worker-src 'self' 'unsafe-eval'` }), 'C26'),
		/allows 'unsafe-eval'/,
	)
	assert.match(
		await failing(mounted({ accepts: ['ready', 'action', 'commit'] }), 'C26'),
		/answers commit from a frame/,
	)
	assert.match(await failing(mounted({ accepts: ['ready'] }), 'C26'), /cannot name an action/)
	const noFrames = await result({ ...sdk, frameMount: undefined }, 'C26')
	assert.equal(noFrames.pass, true)
	assert.match(noFrames.skipped!.join(' '), /supply `frameMount\(\)`/)
})

test('95e · one verdict per law: a door that paraphrases fails C27, naming the verdict and the door', async () => {
	// The kit's teeth for 01 §13, in the shape 95b–95d use. A host whose
	// `validate` door refuses a blank label with words of its own — the rule
	// re-derived rather than the verdict quoted — is exactly the drift the law
	// exists to end, and C27 says which verdict at which door.
	const paraphrasing: HostUnderTest = {
		...sdk,
		doors: {
			...doors,
			validate: (id, failing) =>
				id === 'core:verdict/i18n'
					? "presets[lore].label: the label needs an 'en' text"
					: doors.validate!(id, failing),
		},
	}
	const c27 = (await conform(paraphrasing, fixtures)).find((r) => r.id === 'C27')!
	assert.equal(c27.pass, false, 'C27 passed on a host whose validate door paraphrases the i18n sentence')
	assert.match(c27.error!, /core:verdict\/i18n at 'validate'/)
	assert.match(c27.error!, /re-derives the rule \(R-20\)/)
	assert.match(c27.consequence!, /different refusal depending on which door/)

	// A door that hears nothing at all is named as such, not as a paraphrase.
	const deaf: HostUnderTest = {
		...sdk,
		doors: { ...doors, run: async () => null },
	}
	const c27deaf = (await conform(deaf, fixtures)).find((r) => r.id === 'C27')!
	assert.equal(c27deaf.pass, false)
	assert.match(c27deaf.error!, /at 'run': the door did not refuse/)

	// No seam is a gap named; a door the host lacks is named per verdict —
	// the SDK host has no fire, write, list or publish door, and says so.
	const { doors: _doors, ...noSeam } = sdk
	const gap = (await conform(noSeam, fixtures)).find((r) => r.id === 'C27')!
	assert.equal(gap.pass, true)
	assert.match(gap.skipped!.join(' '), /supplies no `doors` seam/)
	const own = (await conform(sdk, fixtures)).find((r) => r.id === 'C27')!
	assert.equal(own.pass, true, own.error)
	// The SDK host's own C27 skip set, pinned exactly as `<verdictId>@<door>` —
	// a door regressing from heard to unheard (or the reverse) must move this list.
	const skipDoor = (why: string): string => {
		const m =
			/^(\S+) (?:declares the '(\S+)' door and this host has none|at '(\S+)': this host's door does not hear it)/.exec(
				why,
			)
		assert.ok(m, `unrecognized C27 skip shape: ${why}`)
		return `${m![1]}@${m![2] ?? m![3]}`
	}
	assert.deepEqual(
		own.skipped!.map(skipDoor).sort(),
		[
			'core:verdict/i18n@publish',
			'core:verdict/enablement@list',
			'core:verdict/enablement@fire',
			'core:verdict/audience@list',
			'core:verdict/audience@fire',
			'core:verdict/provisional@registry',
			'core:verdict/effects-line@publish',
			'core:verdict/effects-line@write',
			'core:verdict/effects-line@fire',
			'core:verdict/staleness@fire',
			'core:verdict/staleness@list',
		].sort(),
	)
})

test('95e · C30 fails on a host that carries the renderer, and on one that drops a push', async () => {
	const c30 = async (host: HostUnderTest) => (await conform(host, fixtures)).find((r) => r.id === 'C30')!
	const passing = await c30(sdk)
	assert.equal(passing.pass, true, passing.error)

	const carriesRenderer: HostUnderTest = {
		...sdk,
		components: () => [{ id: 'bundled', code: `import { RemoteRootElement } from '@remote-dom/core/elements'\n` }],
	}
	const r1 = await c30(carriesRenderer)
	assert.equal(r1.pass, false)
	assert.match(r1.error!, /component 'bundled'.*renderer/)

	const deaf: HostUnderTest = {
		...sdk,
		mountComponent: async (code, sections) => Object.assign(Object.create(await mountCode(code, sections)), { push: async () => {} }),
	}
	const r2 = await c30(deaf)
	assert.equal(r2.pass, false)
	assert.match(r2.error!, /pushed section must reach the component/)
})
