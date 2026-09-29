/**
 * Actions — venues, audiences and slash names (plans/29 R-15; 09-B B9, F38;
 * plans/30 U5c, 2026-09-16).
 *
 * What is pinned:
 *
 *  1. **The venue set is closed.** A declaration naming a kind core does not
 *     offer is refused at construction, with the list.
 *  2. **Slash names are namespaced by construction.** A core spec may not
 *     claim a dotted name; a plugin spec may not claim a bare one, nor a name
 *     under somebody else's namespace. The same rule runs in `validate()` for
 *     a document the builder never saw.
 *  3. **One slash name means one function.** Two actions claiming one name for
 *     two functions, in one document or across a package, is a collision;
 *     two specs offering the same function under one name are alternatives.
 *  4. **A venue normalises to a list**, and `contributes` keeps whatever
 *     else it carried.
 *  5. **`CORE_ACTIONS` is the one table** for core's verbs: every message verb
 *     the SDK knows is described, the floors marked, `retry`/`extend` also
 *     at the extra venue, and every slash it claims is bare.
 *  6. **`genre` is required** (U5c review, W5): an action naming no genre is
 *     refused at construction, in `validate()` and in `announce.build()`.
 *  7. **Core's verbs hold their slash names in every genre** (U5c review,
 *     S1): a core spec claiming `/retry` for another function collides with
 *     the verb; claiming it for `retry` is an alternative.
 *  8. **A spec id is versionless once built** (U5c review, W-C): a trailing
 *     `@N` is stripped before the id is stored, so an action's identity
 *     (`<spec slug>#<key>`) never carries one; an `@` anywhere else is
 *     refused.
 *  9. **`CORE_ACTIONS` is typed without a cast** (S-E): a core verb declares
 *     no genre, and `genre` is absent rather than an empty string.
 * 10. **`enabledWhen` is read** (U5e, 2026-09-17): a declaration carries it
 *     into the document in list form, and an unsound one is refused with
 *     the junction rule's sentence — the full set is `predicates.test.ts`.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	spec,
	compile,
	validate,
	announce,
	AnnouncementError,
	ACTION_IDENTITY,
	CORE_ACTIONS,
	TURN_CONTROLS,
	CORE_ACTION_SPEC_ID,
	VENUE_KINDS,
	MESSAGE_VERBS,
	MESSAGE_VERB_FLOORS,
	actionsOf,
	slashNameOf,
	slashCollisions,
	normalizeContributes,
	enabledWhenFindings,
	actionFindings,
	TEXT_NEEDS,
	collectsFindings,
	resolveTurnControls,
	type SpecDocument,
	type GenreDecl,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	adventureGenre,
	chatGenre,
	lairGenre,
	lairBuildRoomSpec,
	lairNudgeSpec,
	lairWhisperSpec,
	lairTrapSpec,
	lairRevealSpec,
} from '@serene-pub/core-catalog'

const CHAT = chatGenre.id

/**
 * A one-node action spec under `owner`, with whatever `contributes` says. Its
 * actions are offered to the lock's genre — chat unless another is given (R48).
 */
const actionSpec = (id: string, contributes: Record<string, unknown>, lockGenre: GenreDecl = chatGenre) =>
	spec(id, { version: '1.0.0', contributes: contributes as any })
		.inlet('input', C.userMessage.v1(), { genre: lockGenre, event: 'core:event/session-action@1' })
		.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))

/** …compiled to the document a host stores. */
const actionDoc = (id: string, contributes: Record<string, unknown>, lockGenre?: GenreDecl): SpecDocument =>
	compile(actionSpec(id, contributes, lockGenre).build())

const roll = (over: Record<string, unknown> = {}) => ({
	key: 'roll',
	venue: { kind: 'composer' },
	label: { en: 'Roll' },
	description: { en: 'Roll the dice and post the result.' },
	...over,
})

describe('R-15 · the venue set is closed', () => {
	test('a venue kind core does not offer is refused, with the list', () => {
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ venue: { kind: 'toolbar' } })] }),
			(e: Error) =>
				/venue kind 'toolbar' is not one core offers/.test(e.message) &&
				VENUE_KINDS.every((k) => e.message.includes(k)),
		)
	})

	test('several venues, per channel, are one action', () => {
		const doc = actionDoc('core:spec/text', {
			actions: [
				roll({
					key: 'text',
					venue: [{ kind: 'composer', channel: 'phone' }, { kind: 'message', channel: 'phone' }],
				}),
			],
		})
		const [a] = actionsOf(doc)
		assert.deepEqual(
			a!.venue.map((v) => `${v.kind}@${v.channel}`),
			['composer@phone', 'message@phone'],
		)
	})

	test('a venue that is not { kind, channel? } is refused — a bare string included', () => {
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ venue: 'composer' as any })] }),
			/a venue is \{ kind, channel\? \} — got string/,
		)
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ venue: 7 as any })] }),
			/a venue is \{ kind, channel\? \}/,
		)
	})
})

describe('R-15 · slash names are namespaced by construction', () => {
	test('a core spec may not claim a dotted name', () => {
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ slash: 'acme.roll' })] }),
			/a core spec may not claim the namespaced slash name '\/acme.roll'/,
		)
	})

	test('a plugin spec may not claim a bare name', () => {
		assert.throws(
			() => actionSpec('acme:spec/roll', { actions: [roll({ slash: 'roll' })] }),
			/a plugin spec may not claim the bare slash name '\/roll'/,
		)
	})

	test("a plugin spec may not claim another plugin's namespace", () => {
		assert.throws(
			() => actionSpec('acme:spec/roll', { actions: [roll({ slash: 'chariot.roll' })] }),
			/claims the namespace 'chariot' — a spec under 'acme' names its actions '\/acme.<action>'/,
		)
	})

	test('a well-formed name in its own namespace is accepted, and derived when absent', () => {
		const declared = actionDoc('acme:spec/roll', { actions: [roll({ slash: 'acme.roll' })] })
		assert.equal(slashNameOf(actionsOf(declared)[0]!, declared.id), 'acme.roll')
		const derived = actionDoc('acme:spec/roll', { actions: [roll()] })
		assert.equal(slashNameOf(actionsOf(derived)[0]!, derived.id), 'acme.roll')
		const core = actionDoc('core:spec/roll', { actions: [roll()] })
		assert.equal(slashNameOf(actionsOf(core)[0]!, core.id), 'roll')
	})

	test('validate() applies the same grammar to a document the builder never saw', () => {
		const doc = actionDoc('core:spec/roll', { actions: [roll()] })
		const forged: SpecDocument = {
			...doc,
			id: 'acme:spec/roll',
			contributes: { actions: [roll({ slash: 'roll' })] },
		}
		const findings = validate(forged).filter((f) => f.law === 'R-15')
		assert.ok(findings.some((f) => /bare slash name/.test(f.message)), JSON.stringify(findings))
	})
})

describe('R-15 · one slash name means one action (plans/31 V2)', () => {
	test('two actions of one spec claiming one name is refused', () => {
		assert.throws(
			() =>
				actionDoc('core:spec/dice', {
					actions: [roll(), roll({ key: 'roll-again', slash: 'roll' })],
				}),
			/'\/roll' is claimed twice for genre/,
		)
	})

	test('two specs offering one name are two actions a palette could not tell apart — a collision, since V2', () => {
		// Until V2 two specs sharing a *function* under one name were
		// alternatives a binding selected among. The function is gone: each
		// is its own identity, and one slash name means one of them.
		const a = actionsOf(actionDoc('core:spec/narrate-a', { actions: [roll({ key: 'narrate' })] }))
		const b = actionsOf(actionDoc('core:spec/narrate-b', { actions: [roll({ key: 'narrate' })] }))
		const found = slashCollisions([...a, ...b])
		assert.equal(found.length, 1)
		assert.match(found[0]!, /'\/narrate' is claimed twice .* by 'core:spec\/narrate-a' for 'narrate' and by 'core:spec\/narrate-b' for 'narrate' — one slash name means one action/)
		// The same declaration met twice is one action, not two.
		assert.deepEqual(slashCollisions([...a, ...a]), [])
	})

	test('the same name for two genres never meets in one palette — no collision', () => {
		const a = actionsOf(actionDoc('core:spec/look-a', { actions: [roll({ key: 'look' })] }, adventureGenre))
		const b = actionsOf(actionDoc('core:spec/look-b', { actions: [roll({ key: 'look' })] }))
		assert.deepEqual(slashCollisions([...a, ...b]), [])
	})

	test('a plugin declaring the same key as a core verb is a different identity under its own name — never a collision', () => {
		const a = actionsOf(actionDoc('acme:spec/retry', { actions: [roll({ key: 'retry' })] }))
		assert.deepEqual(slashCollisions(a), [])
		assert.equal(a[0]!.specId + '#' + a[0]!.key, 'acme:spec/retry#retry')
	})

	test('announce.build() refuses a package whose two specs collide', () => {
		const one = actionSpec('acme:spec/one', { actions: [roll({ slash: 'acme.roll' })] }).build()
		const two = actionSpec('acme:spec/two', {
			actions: [roll({ key: 'reroll', slash: 'acme.roll' })],
		}).build()
		assert.throws(
			() => announce({ ns: 'acme', author: 'Acme', title: 'Acme dice' }).pipelines(one, two).build(),
			(e: unknown) =>
				e instanceof AnnouncementError && e.message.includes("'/acme.roll' is claimed twice"),
		)
	})
})

describe('R-15 · genre is required (U5c review, W5) — and comes from the lock (R48)', () => {
	const noGenre = roll()

	test('the builder fills the genre from the inlet lock, and refuses one stated', () => {
		assert.equal(actionsOf(actionDoc('core:spec/roll', { actions: [roll()] }))[0]!.genre, CHAT)
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ genre: CHAT })] }),
			/action 'roll' states a genre — drop it: an action is offered to the genre of the spec's inlet lock/,
		)
		assert.throws(
			() => spec('core:spec/roll', { version: '1.0.0', contributes: { actions: [roll()] as any } }).build(),
			/contributes action 'roll' but has no inlet lock/,
		)
	})

	test('validate() refuses a document the builder never saw', () => {
		const doc = actionDoc('core:spec/roll', { actions: [roll()] })
		const forged: SpecDocument = { ...doc, contributes: { actions: [noGenre] } }
		const findings = validate(forged).filter((f) => f.law === 'R-15')
		assert.ok(findings.some((f) => /'genre' is required/.test(f.message)), JSON.stringify(findings))
	})

	test('announce.build() refuses a package carrying one', () => {
		const built = actionSpec('acme:spec/roll', { actions: [roll({ slash: 'acme.roll' })] }).build()
		// Forged past the builder, the way a hand-edited package would arrive.
		const forged = { ...built, meta: { ...built.meta, contributes: { actions: [noGenre] } } }
		assert.throws(
			() => announce({ ns: 'acme', author: 'Acme', title: 'Acme dice' }).pipelines(forged as any).build(),
			(e: unknown) => e instanceof AnnouncementError && /'genre' is required/.test(e.message),
		)
	})
})

describe("R-15 · core's verbs hold their slash names in every genre (U5c review, S1)", () => {
	test('a core spec claiming a verb\'s name collides with the verb', () => {
		assert.throws(
			() => actionDoc('core:spec/redo', { actions: [roll({ key: 'redo', slash: 'retry' })] }),
			/'\/retry' is claimed twice for genre 'core:genre\/chat': by 'core' for 'retry' and by 'core:spec\/redo' for 'redo'/,
		)
		// …and a verb with no declared slash holds its key: `/edit` is edit's.
		assert.throws(
			() => actionDoc('core:spec/rewrite', { actions: [roll({ key: 'rewrite', slash: 'edit' })] }),
			/'\/edit' is claimed twice/,
		)
	})

	test('a core spec re-declaring a verb under its own name collides too (V2: `core#retry` and `core:spec/retry-again#retry` are two), and the seed reaches every genre', () => {
		assert.throws(
			() => actionDoc('core:spec/retry-again', { actions: [roll({ key: 'retry', slash: 'retry' })] }),
			/'\/retry' is claimed twice for genre 'core:genre\/chat': by 'core' for 'retry' and by 'core:spec\/retry-again' for 'retry'/,
		)
		const adventure = actionsOf(actionDoc('core:spec/adv-redo', { actions: [roll({ key: 'redo' })] }, adventureGenre))
		assert.deepEqual(slashCollisions(adventure), [])
		const clash = actionsOf({ ...actionDoc('core:spec/adv-redo', { actions: [roll({ key: 'redo' })] }, adventureGenre), contributes: { actions: [roll({ key: 'redo', genre: 'core:genre/adventure', slash: 'extend' })] } })
		assert.equal(slashCollisions(clash).length, 1)
		assert.match(slashCollisions(clash)[0]!, /for genre 'core:genre\/adventure': by 'core' for 'extend'/)
	})
})

describe('R-15 · an action takes its document form', () => {
	test('normalizeContributes lists the venue and keeps whatever else contributes carried', () => {
		const out = normalizeContributes({
			other: 1,
			actions: [{ key: 'x', genre: CHAT, venue: { kind: 'composer' }, label: { en: 'X' } }],
		} as any)
		assert.equal((out as any).other, 1)
		assert.deepEqual((out as any).actions[0].venue, [{ kind: 'composer' }])
	})

	test('a label that is not a locale map is refused', () => {
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ label: { fr: 'Lancer' } })] }),
			/label: a locale map with a required 'en'/,
		)
	})
})

describe('R-15 · CORE_ACTIONS is the one table for the verbs', () => {
	test('every message verb and every floor is described exactly once', () => {
		const keys = CORE_ACTIONS.map((a) => a.key)
		assert.equal(new Set(keys).size, keys.length)
		for (const v of [...MESSAGE_VERBS, ...MESSAGE_VERB_FLOORS])
			if (v !== 'stepBack') assert.ok(keys.includes(v), `${v} is not described`)
		assert.deepEqual(
			CORE_ACTIONS.filter((a) => a.floor).map((a) => a.key).sort(),
			[...MESSAGE_VERB_FLOORS].sort(),
		)
	})

	test('every core verb lives at the message venue, retry also at extra; the turn control advance at extra alone (B7)', () => {
		for (const a of CORE_ACTIONS) {
			const message = a.venue.some((v) => v.kind === 'message')
			const extra = a.venue.some((v) => v.kind === 'extra')
			const turnControl = ['advance', 'pick', 'narrate', 'retake'].includes(a.key)
			assert.equal(message, !turnControl, a.key)
			assert.equal(extra, a.key === 'retry' || turnControl, a.key)
		}
	})

	test('the slash names core claims are bare, and only the turn controls and retry claim one', () => {
		for (const a of CORE_ACTIONS) {
			if (a.slash) assert.match(a.slash, /^[a-z][a-z0-9-]*$/)
			assert.equal(!!a.slash, ['advance', 'pick', 'narrate', 'retake', 'retry'].includes(a.key), a.key)
		}
	})

	test("the prefill extend and the composer's Continue are two declarations (B7): advance acts on no row, and is a turn control", () => {
		const cont = CORE_ACTIONS.find((a) => a.key === 'extend')!
		const adv = CORE_ACTIONS.find((a) => a.key === 'advance')!
		assert.deepEqual(cont.venue, [{ kind: 'message' }])
		assert.deepEqual(adv.venue, [{ kind: 'extra' }])
		assert.equal((adv.label as any).en, 'Continue')
		assert.ok(!adv.enabledWhen!.some((p) => String(p.on).startsWith('item.')), 'advance names no row')
		assert.deepEqual([...TURN_CONTROLS], ['advance', 'pick', 'narrate', 'retake'])
		assert.ok(!(MESSAGE_VERBS as readonly string[]).includes('advance'))
	})

	test('Pick who speaks and the narrator turn are core turn controls at the extra venue (B8)', () => {
		for (const key of ['pick', 'narrate']) {
			const a = CORE_ACTIONS.find((x) => x.key === key)!
			assert.ok(a, key)
			assert.deepEqual(a.venue, [{ kind: 'extra' }], key)
			assert.ok(!a.enabledWhen!.some((p) => String(p.on).startsWith('item.')), `${key} names no row`)
			assert.ok(a.enabledWhen!.some((p) => p.on === 'session.generating'), `${key} greys while busy`)
		}
		const pick = CORE_ACTIONS.find((x) => x.key === 'pick')!
		const nobody = pick.enabledWhen!.find((p) => p.on === 'state.who.active')!
		assert.equal((nobody.reason as any).en, 'nobody is seated to pick')
		assert.deepEqual(CORE_ACTIONS.find((x) => x.key === 'narrate')!.audience!.act, ['owner'])
	})

	test('retake is a core turn control at the extra venue, the owner\'s, offered only where a genre declares it (R2)', () => {
		const a = CORE_ACTIONS.find((x) => x.key === 'retake')!
		assert.ok(a, 'core#retake is declared')
		assert.deepEqual(a.venue, [{ kind: 'extra' }])
		assert.equal((a.label as any).en, 'Regenerate')
		assert.equal(a.slash, 'retake')
		assert.deepEqual(a.audience!.act, ['owner'])
		assert.ok(!a.enabledWhen!.some((p) => String(p.on).startsWith('item.')), 'retake names no row')
		assert.ok(a.enabledWhen!.some((p) => p.on === 'session.generating'), 'retake greys while busy')
		// Offered only when declared: no shape's own default switches it on.
		const withCast = { characters: { min: 0 } }
		assert.equal(resolveTurnControls(undefined).retake.offered, false)
		assert.equal(resolveTurnControls({ ...withCast, voice: 'narrator' }).retake.offered, false)
		assert.equal(resolveTurnControls({ ...withCast, turnControls: { retake: true } }).retake.offered, true)
		assert.equal(resolveTurnControls(lairGenre.shape).retake.offered, true)
		for (const g of [chatGenre, adventureGenre]) assert.equal(resolveTurnControls(g.shape).retake.offered, false, g.id)
	})

	test('every label is a locale map with en, and the audience names participant references', () => {
		for (const a of CORE_ACTIONS) {
			assert.equal(typeof (a.label as any).en, 'string', a.key)
			assert.ok(a.audience && a.audience.act.length && a.audience.see.length, a.key)
		}
	})

	test('every verb but stop carries an enabled-when, every predicate sound (U5e)', () => {
		for (const a of CORE_ACTIONS) {
			if (a.key === 'stop') assert.equal(a.enabledWhen, undefined)
			else {
				assert.ok(Array.isArray(a.enabledWhen) && a.enabledWhen.length, a.key)
				assert.deepEqual(enabledWhenFindings(a.enabledWhen), [], a.key)
			}
		}
	})

	test('every core verb is a built-in under `core#<key>` — the table carries no second key (V2)', () => {
		for (const a of CORE_ACTIONS) {
			assert.equal((a as { function?: unknown }).function, undefined, a.key)
			assert.equal(`${CORE_ACTION_SPEC_ID}#${a.key}`, `core#${a.key}`)
		}
	})
})

describe('W-C · a spec id is versionless once built', () => {
	test("a trailing @N is stripped, so the actions of 'demo:slot-address@1' read 'demo:slot-address#roll'", () => {
		const doc = actionDoc('demo:slot-address@1', {
			actions: [roll({ slash: 'demo.roll' })],
		})
		assert.equal(doc.id, 'demo:slot-address')
		const [a] = actionsOf(doc)
		const identity = `${a!.specId}#${a!.key}`
		assert.equal(identity, 'demo:slot-address#roll')
		assert.match(identity, ACTION_IDENTITY)
	})

	test('an @ anywhere but a trailing pin is refused', () => {
		assert.throws(() => spec('demo:sl@ot', { version: '1.0.0' }), /not a valid spec id/)
		assert.throws(() => spec('demo:slot@1x', { version: '1.0.0' }), /not a valid spec id/)
		assert.throws(() => spec('de@mo:slot@1', { version: '1.0.0' }), /not a valid spec id/)
	})
})

describe('S-E · CORE_ACTIONS carries no genre', () => {
	test('a core verb is offered in every genre, so none is named on it', () => {
		for (const a of CORE_ACTIONS) assert.equal('genre' in a, false, a.key)
	})
})

describe('R3 · an action collects text and recipients by declaration', () => {
	const TEXT = { need: 'required', label: { en: 'What do you whisper?' } }
	test('collects rides the document as declared; absent stays absent', () => {
		const doc = actionDoc('core:spec/say', {
			actions: [roll({ key: 'say', collects: { text: TEXT } }), roll()],
		})
		const [say, plain] = actionsOf(doc)
		assert.deepEqual(say!.collects, { text: TEXT })
		assert.equal('collects' in plain!, false)
		assert.deepEqual([...TEXT_NEEDS], ['required', 'optional'])
	})

	test('any venue may collect — a message press opens the modal too', () => {
		const out = actionFindings(
			roll({ genre: CHAT, venue: { kind: 'message' }, collects: { text: TEXT } }),
			'core:spec/roll',
		)
		assert.deepEqual(out, [])
	})

	test('an unknown key is refused, naming the known ones', () => {
		const top = collectsFindings({ text: TEXT, draft: true }, 'x.collects')
		assert.ok(top.some((m) => /x\.collects: 'draft' is not something an action collects here — one of text, recipients/.test(m)), top.join('\n'))
		const inner = collectsFindings({ text: { ...TEXT, mode: 'x' } }, 'x.collects')
		assert.ok(inner.some((m) => /x\.collects\.text: 'mode'/.test(m)), inner.join('\n'))
	})

	test('an unknown need is refused, naming the needs', () => {
		const out = actionFindings(roll({ genre: CHAT, collects: { text: { ...TEXT, need: 'always' } } }), 'core:spec/roll')
		assert.ok(out.some((m) => /collects\.text\.need is one of required, optional/.test(m)), out.join('\n'))
	})

	test('a missing label is refused, for text and for recipients', () => {
		const out = collectsFindings({ text: { need: 'required' }, recipients: {} }, 'x.collects')
		assert.ok(out.some((m) => /x\.collects\.text\.label is required/.test(m)), out.join('\n'))
		assert.ok(out.some((m) => /x\.collects\.recipients\.label is required/.test(m)), out.join('\n'))
	})

	test("an optional need says what an empty submit does", () => {
		const out = collectsFindings({ text: { need: 'optional', label: 'What is the trap?' } }, 'x.collects')
		assert.ok(out.some((m) => /x\.collects\.text\.ifEmpty is required when need is 'optional'/.test(m)), out.join('\n'))
		assert.deepEqual(
			collectsFindings({ text: { need: 'optional', label: 'What is the trap?', ifEmpty: 'The room decides.' } }, 'x'),
			[],
		)
	})

	test('min is 1 or more, and max is no smaller than min', () => {
		const who = { label: 'Who hears it' }
		assert.deepEqual(collectsFindings({ recipients: who }, 'x'), [])
		assert.deepEqual(collectsFindings({ recipients: { ...who, min: 2, max: 2 } }, 'x'), [])
		assert.ok(collectsFindings({ recipients: { ...who, min: 0 } }, 'x').some((m) => /x\.recipients\.min is a whole number, 1 or more/.test(m)))
		assert.ok(collectsFindings({ recipients: { ...who, min: 3, max: 2 } }, 'x').some((m) => /x\.recipients\.max is a whole number no smaller than min \(3\)/.test(m)))
		assert.ok(collectsFindings({ recipients: { ...who, max: 0 } }, 'x').some((m) => /no smaller than min \(1\)/.test(m)))
	})

	test('R10 · overwrites names the slot a recipient\'s value is replaced on — a slot id or nothing', () => {
		const who = { label: 'Who hears it' }
		assert.deepEqual(collectsFindings({ recipients: { ...who, overwrites: 'core:slot/whisper@1' } }, 'x'), [])
		for (const bad of ['whisper', 7, ''])
			assert.ok(
				collectsFindings({ recipients: { ...who, overwrites: bad } }, 'x').some((m) =>
					/x\.recipients\.overwrites is a slot id \('core:slot\/whisper@1'\)/.test(m),
				),
				String(bad),
			)
	})

	test("R10 · the Lair's Whisper collects who hears it — at least one, overwriting each one's whisper", () => {
		const [a] = actionsOf(lairWhisperSpec() as any)
		assert.deepEqual(a!.collects?.recipients, {
			label: { en: 'Who hears it' },
			min: 1,
			overwrites: 'core:slot/whisper@1',
		})
		assert.deepEqual(actionFindings(a as any, 'core:spec/lair-whisper'), [])
	})

	test('collecting nothing is refused', () => {
		assert.ok(collectsFindings({}, 'x').some((m) => /x collects nothing/.test(m)))
	})

	test("the Lair's Nudge, Whisper and Build room need their text", () => {
		for (const make of [lairNudgeSpec, lairWhisperSpec, lairBuildRoomSpec]) {
			const [a] = actionsOf(make() as any)
			assert.equal(a!.collects?.text?.need, 'required', a!.key)
			assert.ok(a!.collects?.text?.label, a!.key)
		}
	})

	test("the Lair's Trigger trap and Reveal take it when there is some, and say what empty does", () => {
		for (const make of [lairTrapSpec, lairRevealSpec]) {
			const [a] = actionsOf(make() as any)
			assert.equal(a!.collects?.text?.need, 'optional', a!.key)
			assert.deepEqual(a!.collects?.text?.ifEmpty, { en: 'The room decides.' }, a!.key)
		}
	})
})

describe('W-GATE D3 · an action declares when it is present', () => {
	const PW = { on: 'session.openForm.action', equals: 'core:spec/roll#roll', reason: { en: 'Nothing to roll for' } }
	test('present-when rides the document in list form', () => {
		const [a] = actionsOf(actionDoc('core:spec/roll', { actions: [roll({ presentWhen: PW })] }))
		assert.deepEqual(a!.presentWhen, [PW])
	})

	test('a malformed present-when is refused with the enabled-when sentences', () => {
		const out = actionFindings(
			roll({ genre: CHAT, presentWhen: { on: '$.input.text', truthy: true, reason: 'x' } }),
			'core:spec/roll',
		)
		assert.ok(out.some((m) => /presentWhen: 'on' is '\$\.input\.text'/.test(m)), out.join('\n'))
	})

	test('an item.* present-when is refused: a listing has no row to read', () => {
		const out = actionFindings(
			roll({
				genre: CHAT,
				venue: { kind: 'message' },
				presentWhen: { on: 'item.hidden', equals: false, reason: 'x' },
			}),
			'core:spec/roll',
		)
		assert.ok(out.some((m) => /presentWhen\[0\]: reads 'item\.hidden'/.test(m)), out.join('\n'))
	})
})

describe('the legend · every action says what it does (2026-09-28)', () => {
	const bare = (over: Record<string, unknown> = {}) => {
		const { description: _d, ...rest } = roll({ genre: CHAT, ...over }) as Record<string, unknown>
		return rest
	}

	test('an action without a description is refused at authoring, by sentence', () => {
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [bare({ genre: undefined })] }),
			(e: Error) => /\[roll\]: 'description' is required — one plain sentence/.test(e.message),
		)
		const out = actionFindings(bare(), 'core:spec/roll')
		assert.ok(out.some((m) => /'description' is required/.test(m)), out.join('\n'))
	})

	test('validate() refuses a document whose action has none', () => {
		const doc = actionDoc('core:spec/roll', { actions: [roll()] })
		const forged: SpecDocument = { ...doc, contributes: { actions: [bare({ genre: CHAT })] } }
		const findings = validate(forged).filter((f) => f.law === 'R-15')
		assert.ok(findings.some((f) => /'description' is required/.test(f.message)), JSON.stringify(findings))
	})

	test('a blank description is refused like a blank label', () => {
		const out = actionFindings(roll({ genre: CHAT, description: { en: '  ' } }), 'core:spec/roll')
		assert.ok(out.some((m) => /description\.en is empty/.test(m)), out.join('\n'))
	})

	test('iconAlt is display text, and needs an icon to describe', () => {
		assert.deepEqual(actionFindings(roll({ genre: CHAT, icon: 'dice-5', iconAlt: { en: 'A die' } }), 'core:spec/roll'), [])
		const orphan = actionFindings(roll({ genre: CHAT, iconAlt: { en: 'A die' } }), 'core:spec/roll')
		assert.ok(orphan.some((m) => /'iconAlt' needs an 'icon'/.test(m)), orphan.join('\n'))
		const bad = actionFindings(roll({ genre: CHAT, icon: 'dice-5', iconAlt: 3 }), 'core:spec/roll')
		assert.ok(bad.some((m) => /iconAlt: a locale map/.test(m)), bad.join('\n'))
	})

	test("every core verb and turn control carries one", () => {
		for (const a of CORE_ACTIONS) {
			const text = typeof a.description === 'string' ? a.description : a.description?.en
			assert.ok(text && text.trim().length > 0, `core#${a.key} has no description`)
		}
	})
})
