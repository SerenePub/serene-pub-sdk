/**
 * The per-message half of the verb gate (U5c; U5e). The action list says
 * which verbs the session offers, who may act, and the enabled-when verdict
 * over the session's published values; this pins how one message's own
 * `item` document is judged against the `item.*` predicates the list hands
 * over, so the quick row and the ⋮ menu — both readers of this table —
 * agree by construction, and agree with the door.
 *
 * The context is built the way the server builds the listing: each core
 * verb's `enabledWhen` (`CORE_ACTIONS`) split into the session half — judged
 * here against `session.generating`, as the server does at listing — and the
 * `item.*` half handed over as `itemPredicates`.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CORE_ACTIONS, evaluateEnabledWhen, partitionEnabledWhen } from '@serene-pub/sdk'
import {
	coreVerbState,
	enabledWhenState,
	itemSpeakerOf,
	itemValuesOf,
	notYoursToUse,
	quickRowActions,
	statusTextIn,
	verbKeyOf,
	verdictOf,
	VERB_REASONS,
	type RowAction,
	type VerbContext,
} from '../core-catalog/src/ui/sessions/conversation/index.js'

/** The list's verdict for one core verb, as `listSessionActions` computes it — the wire's shape. */
const listedRow = (key: string, generating: boolean) => {
	const preds = CORE_ACTIONS.find((a) => a.key === key)?.enabledWhen ?? []
	const { under, rest } = partitionEnabledWhen(preds, 'item')
	const v = evaluateEnabledWhen(rest, { session: { generating } })
	return {
		enabled: v.enabled,
		...(v.enabled ? {} : { reason: { i18n: v.reason } }),
		...(under.length ? { itemPredicates: under } : {}),
	}
}
/** …and the same lifted onto the context, the reason a sentence (`verdictOf`). */
const listed = (key: string, generating: boolean) => {
	const {
		canAct: _a,
		itemGated: _i,
		...rest
	} = verdictOf({
		key,
		specSlug: 'core',
		name: key,
		audience: { act: ['item'] },
		canAct: true,
		itemGated: true,
		...listedRow(key, generating),
	})
	return rest
}

/**
 * The audience's sentence a grey control carries — `core:verdict/audience`'s
 * own, as the fire refuses with it (01 §13). The chips' vocabulary quotes
 * it rather than keeping a fragment of its own.
 */
const notYours = (name: string, act: string[]) =>
	`'${name}' is not yours to use here — its audience is ${act.join(', ')}.`

const base = (over: Partial<VerbContext> = {}): VerbContext => ({
	msg: { id: 1, characterId: 7, content: 'hello', role: 'assistant' },
	isLastMessage: true,
	editing: false,
	hasGeneratingMessage: false,
	canControl: true,
	canAct: true,
	action: { name: 'Roll', act: ['owner'] },
	...over,
})

/** A context for one core verb, its verdict computed off the table like the server's. */
const ctx = (key: string, over: Partial<VerbContext> = {}): VerbContext => {
	const b = base(over)
	return { ...b, ...listed(key, b.hasGeneratingMessage), ...over }
}

const state = (key: string, over: Partial<VerbContext> = {}) => coreVerbState(key, ctx(key, over))

describe('core verbs on a message', () => {
	it('stop shows only on the message that is generating', () => {
		assert.deepEqual(state('stop'), { shown: false, disabled: false })
		assert.deepEqual(state('stop', { msg: { characterId: 7, isGenerating: true } }), {
			shown: true,
			disabled: false,
		})
	})

	it('retry and extend belong to the newest reply, and extend carries its refusal', () => {
		assert.deepEqual(state('retry'), { shown: true, disabled: false })
		assert.equal(state('retry', { isLastMessage: false }).shown, false)
		assert.equal(state('retry', { msg: { personaId: 1 } as any }).shown, false)
		assert.equal(state('retry', { canControl: false }).disabled, true)
		assert.equal(state('extend', { msg: { characterId: 7, content: '' } }).shown, false)
		assert.deepEqual(state('extend', { extendRefusal: 'No prefill.' }), {
			shown: true,
			disabled: true,
			reason: 'No prefill.',
		})
	})

	it('edit is on every message, off while busy, hidden or not yours', () => {
		assert.deepEqual(state('edit', { msg: { personaId: 3 } as any }), {
			shown: true,
			disabled: false,
		})
		assert.equal(state('edit', { hasGeneratingMessage: true }).disabled, true)
		assert.equal(state('edit', { msg: { characterId: 7, isHidden: true } }).disabled, true)
		assert.equal(state('edit', { canControl: false }).disabled, true)
	})

	it('branch reads the audience, not the item rule', () => {
		assert.equal(state('branch', { canControl: false }).disabled, false)
		assert.equal(state('branch', { canAct: false }).disabled, true)
	})

	it('swipe, hide and delete follow the item rule; swipe needs a swipe to take', () => {
		assert.deepEqual(state('swipe'), { shown: true, disabled: false })
		// A greeting on its last alternative has nothing to swipe to; one
		// with an alternative to the right has.
		const greeting = (idx: number) =>
			({
				id: 1,
				characterId: 7,
				role: 'assistant',
				metadata: {
					isGreeting: true,
					swipes: { currentIdx: idx, history: ['a', 'b'] },
				},
			}) as VerbContext['msg']
		assert.equal(state('swipe', { msg: greeting(1) }).disabled, true)
		assert.equal(state('swipe', { msg: greeting(0) }).disabled, false)
		assert.equal(state('hide', { canControl: false }).disabled, true)
		assert.equal(state('delete', { editing: true }).disabled, true)
	})

	it("the author's own line gets no retry, extend or swipe, in any genre (F1)", () => {
		// A persona-less genre's user line: no persona, no character — and a
		// user line that carries a character (the author portraying one).
		for (const msg of [
			{ id: 2, role: 'user', content: 'I open the door.' },
			{ id: 2, role: 'user', characterId: 7, content: 'I open the door.' },
		] as VerbContext['msg'][]) {
			for (const key of ['retry', 'extend', 'swipe']) {
				const s = state(key, { msg })
				assert.ok(!s.shown || s.disabled, `${key} on ${JSON.stringify(msg)}`)
			}
			assert.equal(state('edit', { msg }).disabled, false)
		}
		// The judged half says why, in the door's words.
		const [held, reason] = enabledWhenState({
			...ctx('swipe'),
			msg: { id: 2, role: 'user', characterId: 7 },
		})
		assert.equal(held, true)
		assert.equal(reason, 'your own line is edited, not regenerated')
	})

	it('a contributed action gets the generic answer: shown unless generating, disabled while busy or by the audience', () => {
		assert.deepEqual(coreVerbState('acme-roll', base()), {
			shown: true,
			disabled: false,
		})
		assert.equal(coreVerbState('acme-roll', base({ canAct: false })).disabled, true)
		assert.equal(
			coreVerbState('acme-roll', base({ msg: { characterId: 7, isGenerating: true } })).shown,
			false,
		)
		assert.equal(
			coreVerbState('acme-roll', base({ hasGeneratingMessage: true })).disabled,
			true,
		)
	})

	it("an item-gated contributed action defers to the message's ownership rule, not only the audience (W6)", () => {
		assert.equal(
			coreVerbState('contributed:acme-rewrite', base({ itemGated: true, canControl: false }))
				.disabled,
			true,
		)
		assert.equal(
			coreVerbState('contributed:acme-rewrite', base({ itemGated: true, canControl: true }))
				.disabled,
			false,
		)
		assert.equal(
			coreVerbState('contributed:acme-roll', base({ itemGated: false, canControl: false }))
				.disabled,
			false,
		)
	})

	it("a contributed action's own enabled-when greys it with its reason, and its item.* predicates are judged per row (U5e)", () => {
		// The list's verdict — the server judged `state.world.location` and said no.
		assert.deepEqual(
			coreVerbState(
				'contributed:look',
				base({
					enabled: false,
					reason: 'Set a location first — Look describes where you are.',
				}),
			),
			{
				shown: true,
				disabled: true,
				reason: 'Set a location first — Look describes where you are.',
			},
		)
		// An `item.*` predicate the server could not judge: this row's own document decides.
		const onlyMine = [
			{
				on: 'item.mine',
				truthy: true,
				reason: { en: 'only on your own line' },
			},
		]
		assert.deepEqual(
			coreVerbState(
				'contributed:annotate',
				base({ itemPredicates: onlyMine, canControl: false }),
			),
			{
				shown: true,
				disabled: true,
				reason: 'only on your own line',
			},
		)
		assert.equal(
			coreVerbState(
				'contributed:annotate',
				base({ itemPredicates: onlyMine, canControl: true }),
			).disabled,
			false,
		)
		// The audience's word still comes first — the verdict's sentence.
		assert.equal(
			coreVerbState(
				'contributed:annotate',
				base({
					itemPredicates: onlyMine,
					canControl: false,
					canAct: false,
					action: { name: 'Annotate', act: ['owner'] },
				}),
			).reason,
			notYours('Annotate', ['owner']),
		)
	})
})

describe('why a verb is grey (UI nit 2)', () => {
	it("every disabled answer carries a reason, in the chips' vocabulary", () => {
		assert.equal(state('edit', { canControl: false }).reason, 'not yours to change')
		assert.equal(
			state('edit', { hasGeneratingMessage: true }).reason,
			'wait for the reply to finish',
		)
		assert.equal(state('edit', { editing: true }).reason, 'finish the edit first')
		assert.equal(
			state('edit', { msg: { characterId: 7, isHidden: true } }).reason,
			'unhide it first',
		)
		// Retry on a row that is shown but not the newest reply the road can
		// redo — a greeting — says why; the newest rule itself hides the row.
		assert.equal(
			state('retry', {
				msg: { id: 1, characterId: 7, role: 'assistant', metadata: { isGreeting: true } },
			}).reason,
			'a greeting is swiped, not regenerated',
		)
		assert.equal(
			state('swipe', {
				msg: {
					id: 1,
					characterId: 7,
					role: 'assistant',
					metadata: {
						isGreeting: true,
						swipes: { currentIdx: 1, history: ['a', 'b'] },
					},
				},
			}).reason,
			'nothing to swipe to',
		)
		// The audience's sentence is the verdict's own — the words the fire
		// refuses with — naming the action and who may act (01 §13).
		assert.equal(state('branch', { canAct: false }).reason, notYours('branch', ['item']))
		assert.equal(state('delete', { canControl: false }).reason, 'not yours to change')
		assert.equal(
			coreVerbState('contributed:acme-roll', base({ canAct: false })).reason,
			notYours('Roll', ['owner']),
		)
		// An item-gated action's audience names `item`, and the row's own
		// ownership rule is what refused: the sentence says so.
		assert.equal(
			coreVerbState(
				'contributed:acme-rewrite',
				base({
					itemGated: true,
					canControl: false,
					action: { name: 'Rewrite', act: ['owner', 'item'] },
				}),
			).reason,
			notYours('Rewrite', ['owner', 'item']),
		)
		// Extend's own sentence names the switch; the ownership rule still wins.
		assert.equal(state('extend', { extendRefusal: 'No prefill.' }).reason, 'No prefill.')
		assert.equal(
			state('extend', {
				extendRefusal: 'No prefill.',
				canControl: false,
			}).reason,
			'not yours to change',
		)
	})

	it("the ownership rule's sentence wins over a busy state — a grey control does not change its reason because something else is busy", () => {
		assert.equal(
			state('edit', { canControl: false, hasGeneratingMessage: true }).reason,
			'not yours to change',
		)
		assert.equal(
			state('branch', { canAct: false, editing: true }).reason,
			notYours('branch', ['item']),
		)
	})

	it('an enabled verb carries none', () => {
		for (const key of ['edit', 'retry', 'extend', 'branch', 'swipe', 'hide', 'delete'])
			assert.equal(state(key).reason, undefined, key)
	})

	it("the state half's sentences are the SDK's — one vocabulary with the door", () => {
		assert.equal(VERB_REASONS.generating, 'wait for the reply to finish')
		assert.equal(VERB_REASONS.notNewest, 'only the newest reply can be regenerated')
		assert.equal(VERB_REASONS.hidden, 'unhide it first')
		assert.equal(VERB_REASONS.noSwipe, 'nothing to swipe to')
	})
})

describe('the enabled-when half on its own', () => {
	it("the list's no comes first, with its sentence; then the item predicates; then nothing", () => {
		assert.deepEqual(enabledWhenState(base({ enabled: false, reason: 'why' })), [true, 'why'])
		assert.deepEqual(enabledWhenState(base({ enabled: true })), [false, undefined])
		assert.deepEqual(enabledWhenState(base()), [false, undefined])
		const newest = [{ on: 'item.isNewest', truthy: true, reason: { en: 'newest only' } }]
		assert.deepEqual(enabledWhenState(base({ itemPredicates: newest, isLastMessage: false })), [
			true,
			'newest only',
		])
		assert.deepEqual(enabledWhenState(base({ itemPredicates: newest, isLastMessage: true })), [
			false,
			undefined,
		])
	})

	it("an item predicate's sentence speaks the language of the statusText its caller hands in", () => {
		const newest = [{ on: 'item.isNewest', truthy: true, reason: { en: 'newest only', es: 'solo la más reciente' } }]
		const ctx = base({ itemPredicates: newest, isLastMessage: false })
		assert.deepEqual(enabledWhenState(ctx), [true, 'newest only'])
		assert.deepEqual(enabledWhenState(ctx, { statusText: (s) => statusTextIn(s, 'es', (en) => en) }), [
			true,
			'solo la más reciente',
		])
	})

	it("verdictOf lifts the wire's verdict onto the context, the reason resolved", () => {
		assert.deepEqual(
			verdictOf({
				key: 'look',
				specSlug: 'core:spec/x',
				name: 'Look',
				audience: { act: ['owner'] },
				canAct: true,
				itemGated: false,
				enabled: false,
				reason: { i18n: { en: 'Set a location first' } },
			}),
			{
				canAct: true,
				itemGated: false,
				action: { name: 'Look', act: ['owner'] },
				enabled: false,
				reason: 'Set a location first',
			},
		)
		assert.deepEqual(
			verdictOf({
				key: 'edit',
				specSlug: 'core',
				name: 'Edit',
				audience: { act: ['item'] },
				canAct: true,
				itemGated: true,
			}),
			{
				canAct: true,
				itemGated: true,
				action: { name: 'Edit', act: ['item'] },
			},
		)
	})
})

describe('the quick row', () => {
	const row = (over: Partial<RowAction> & { key: string }): RowAction => ({
		specSlug: 'core',
		name: over.key,
		audience: { act: ['item'] },
		canAct: true,
		itemGated: true,
		...(over.specSlug === undefined || over.specSlug === 'core'
			? listedRow(over.key, false)
			: {}),
		...over,
	})
	const rowCtx = (over: Partial<VerbContext> = {}) => {
		const { canAct: _a, itemGated: _i, action: _act, ...rest } = base(over)
		return rest
	}

	it("draws the primary set, core's and a plugin's alike, minus stop (S8)", () => {
		const primary = [
			row({ key: 'stop' }),
			row({ key: 'edit' }),
			row({ key: 'retry' }),
			row({
				key: 'rewrite',
				specSlug: 'acme:spec/rewrite',
				itemGated: false,
			}),
		]
		assert.deepEqual(
			quickRowActions(primary, rowCtx()).map((q) => q.action.key),
			['edit', 'retry', 'rewrite'],
		)
	})

	it("hides what the menu would disable — the audience, the ownership rule, the message's state", () => {
		const primary = [
			row({ key: 'edit' }),
			row({ key: 'retry' }),
			row({
				key: 'rewrite',
				specSlug: 'acme:spec/rewrite',
				itemGated: false,
				canAct: false,
			}),
			row({
				key: 'annotate',
				specSlug: 'acme:spec/annotate',
				itemGated: true,
			}),
		]
		// A guest on somebody else's message: edit and retry follow the item
		// rule, `annotate` is item-gated, `rewrite` is greyed by its audience.
		assert.deepEqual(quickRowActions(primary, rowCtx({ canControl: false })), [])
		// The owner: all but the greyed one.
		assert.deepEqual(
			quickRowActions(primary, rowCtx()).map((q) => q.action.key),
			['edit', 'retry', 'annotate'],
		)
		// Nothing while a reply streams: the list's verdict says so for
		// core's (re-listed on the flip), the busy guard for a plugin's.
		const busy = [
			{ ...row({ key: 'edit' }), ...listedRow('edit', true) },
			row({
				key: 'annotate',
				specSlug: 'acme:spec/annotate',
				itemGated: true,
			}),
		]
		assert.deepEqual(
			quickRowActions(
				busy,
				rowCtx({
					msg: { characterId: 7, isGenerating: true },
					hasGeneratingMessage: true,
				}),
			),
			[],
		)
		// A declared reason greys a plugin's quick action off the row too.
		assert.deepEqual(
			quickRowActions(
				[
					row({
						key: 'look',
						specSlug: 'acme:spec/look',
						itemGated: false,
						enabled: false,
					}),
				],
				rowCtx(),
			),
			[],
		)
	})

	it("keys the verb table by core key or a contributed prefix — never a plugin's key as core's", () => {
		assert.equal(verbKeyOf({ key: 'edit', specSlug: 'core' }), 'edit')
		assert.equal(verbKeyOf({ key: 'edit', specSlug: 'acme:spec/x' }), 'contributed:edit')
	})
})

describe('notYoursToUse — client symmetry with core:verdict/audience', () => {
	it('carries a sentence for every audience that admits nobody with no portrayals resolved', () => {
		assert.notEqual(notYoursToUse({ name: 'grant', act: [] }), '')
		assert.notEqual(notYoursToUse({ name: 'grant', act: ['item'] }), '')
		assert.notEqual(notYoursToUse({ name: 'grant', act: ['run-owner'] }), '')
	})
})

/**
 * `item.speaker` and `item.characterLine` (lair re-plan R11, 2026-09-28): who
 * spoke the row, built the same way on both sides — so a message action can
 * be offered on "the person's rows and the Castellan's" and greyed on a
 * delver's, and the ⋮ menu and the door say the same.
 */
describe('the item document names the speaker (R11)', () => {
	const doc = (row: Record<string, unknown>) => itemValuesOf({ id: 1, ...row } as any, { isNewest: true, mine: true })

	it("an envoy's line is its reference; a character's is theirs; the person's persona-less line is nobody", () => {
		assert.deepEqual(
			[doc({ role: 'assistant', metadata: { speaker: 'envoy:castellan' } }).speaker, doc({ role: 'assistant', metadata: { speaker: 'envoy:castellan' } }).characterLine],
			['envoy:castellan', false],
		)
		assert.deepEqual(
			[doc({ role: 'assistant', characterId: 7 }).speaker, doc({ role: 'assistant', characterId: 7 }).characterLine],
			['character:7', true],
		)
		assert.deepEqual([doc({ role: 'user' }).speaker, doc({ role: 'user' }).characterLine], [null, false])
		// A persona line is the character the person voiced — and still the person's line.
		assert.deepEqual(
			[doc({ role: 'user', personaId: 4 }).speaker, doc({ role: 'user', personaId: 4 }).characterLine],
			['character:4', false],
		)
		// The pipeline's own voice (a stored narrator row) names nobody.
		assert.deepEqual(
			[doc({ role: 'assistant', isNarratorResponse: true }).speaker, doc({ role: 'assistant', isNarratorResponse: true }).characterLine],
			[null, false],
		)
		// Only an envoy reference is read off the metadata: anything else is not a speaker there.
		assert.equal(itemSpeakerOf({ metadata: { speaker: 'user:5' } }), null)
		assert.equal(itemSpeakerOf({ metadata: { speaker: 42 } }), null)
	})

	it("the ⋮ menu greys a message action on a delver's line with the door's sentence", () => {
		const preds = [
			{ on: 'item.characterLine', equals: false, reason: { en: "a delver's line is theirs" } },
		] as const
		const ctx = (msg: Record<string, unknown>) =>
			enabledWhenState({
				msg: { id: 3, ...msg } as any,
				isLastMessage: true,
				canControl: true,
				enabled: true,
				itemPredicates: preds as any,
			})
		assert.deepEqual(ctx({ role: 'assistant', characterId: 7 }), [true, "a delver's line is theirs"])
		assert.deepEqual(ctx({ role: 'assistant', metadata: { speaker: 'envoy:castellan' } }), [false, undefined])
		assert.deepEqual(ctx({ role: 'user' }), [false, undefined])
		// A persona line — `personaId` on the widget's row — stays the person's.
		assert.deepEqual(ctx({ role: 'user', personaId: 4 }), [false, undefined])
	})
})
