/**
 * Actions — venues, audiences, slash names and the deprecated `triggers`
 * alias (plans/29 R-15; 09-B B9, F38; plans/30 U5c, 2026-09-16).
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
 *  4. **`triggers` normalises.** The pre-U5c spelling folds into `actions` —
 *     `mode` to `genre`, `i18n` to `label`, a bare venue to a list, the key
 *     derived from the function — and a compiled document carries only the
 *     new spelling.
 *  5. **`CORE_ACTIONS` is the one table** for core's verbs: every message verb
 *     the SDK knows is described, the floors marked, `retry`/`continue` also
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
	VENUE_KINDS,
	MESSAGE_VERBS,
	MESSAGE_VERB_FLOORS,
	actionsOf,
	slashNameOf,
	slashCollisions,
	normalizeContributes,
	type SpecDocument,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '@serene-pub/core-catalog'

const CHAT = chatGenre.id

/** A one-node action spec under `owner`, with whatever `contributes` says. */
const actionSpec = (id: string, contributes: Record<string, unknown>) =>
	spec(id, { version: '1.0.0', contributes: contributes as any })
		.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: 'core:event/session-action@1' })
		.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))

/** …compiled to the document a host stores. */
const actionDoc = (id: string, contributes: Record<string, unknown>): SpecDocument =>
	compile(actionSpec(id, contributes).build())

const roll = (over: Record<string, unknown> = {}) => ({
	key: 'roll',
	function: 'roll',
	genre: CHAT,
	venue: { kind: 'composer' },
	label: { en: 'Roll' },
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
					function: 'text',
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

	test('a bare venue string is the alias spelling and normalises; anything else is refused', () => {
		const doc = actionDoc('core:spec/roll', { actions: [roll({ venue: 'composer' as any })] })
		assert.deepEqual(actionsOf(doc)[0]!.venue, [{ kind: 'composer' }])
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

describe('R-15 · one slash name means one function', () => {
	test('two actions of one spec claiming one name for two functions is refused', () => {
		assert.throws(
			() =>
				actionDoc('core:spec/dice', {
					actions: [roll(), roll({ key: 'roll-again', function: 'reroll', slash: 'roll' })],
				}),
			/'\/roll' is claimed twice for genre/,
		)
	})

	test('two specs offering the same function under one name are alternatives, not a collision', () => {
		const a = actionsOf(actionDoc('core:spec/narrate-a', { actions: [roll({ key: 'narrate', function: 'narrate' })] }))
		const b = actionsOf(actionDoc('core:spec/narrate-b', { actions: [roll({ key: 'narrate', function: 'narrate' })] }))
		assert.deepEqual(slashCollisions([...a, ...b]), [])
	})

	test('the same name for two genres never meets in one palette — no collision', () => {
		const a = actionsOf(actionDoc('core:spec/look-a', { actions: [roll({ key: 'look', function: 'look', genre: 'core:genre/adventure' })] }))
		const b = actionsOf(actionDoc('core:spec/look-b', { actions: [roll({ key: 'look', function: 'glance', genre: 'core:genre/chat' })] }))
		assert.deepEqual(slashCollisions([...a, ...b]), [])
	})

	test('announce.build() refuses a package whose two specs collide', () => {
		const one = actionSpec('acme:spec/one', { actions: [roll({ slash: 'acme.roll' })] }).build()
		const two = actionSpec('acme:spec/two', {
			actions: [roll({ key: 'reroll', function: 'reroll', slash: 'acme.roll' })],
		}).build()
		assert.throws(
			() => announce({ ns: 'acme', author: 'Acme', title: 'Acme dice' }).pipelines(one, two).build(),
			(e: unknown) =>
				e instanceof AnnouncementError && e.message.includes("'/acme.roll' is claimed twice"),
		)
	})
})

describe('R-15 · genre is required (U5c review, W5)', () => {
	const { genre: _g, ...noGenre } = roll()

	test('the builder refuses an action naming no genre, with a sentence', () => {
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [noGenre] }),
			/\[roll\]: 'genre' is required — the genre id this action is offered to/,
		)
		assert.throws(
			() => actionSpec('core:spec/roll', { actions: [roll({ genre: '' })] }),
			/'genre' is required/,
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

	test('a trigger alias naming neither mode nor genre is refused the same way', () => {
		assert.throws(
			() => actionDoc('core:spec/old', { triggers: [{ function: 'old', venue: 'composer', i18n: { en: 'Old' } }] }),
			/'genre' is required/,
		)
	})
})

describe("R-15 · core's verbs hold their slash names in every genre (U5c review, S1)", () => {
	test('a core spec claiming a verb\'s name for another function collides with the verb', () => {
		assert.throws(
			() => actionDoc('core:spec/redo', { actions: [roll({ key: 'redo', function: 'redo', slash: 'retry' })] }),
			/'\/retry' is claimed twice for genre 'core:genre\/chat': by 'core' for 'retry' and by 'core:spec\/redo' for 'redo'/,
		)
		// …and a verb with no declared slash holds its key: `/edit` is edit's.
		assert.throws(
			() => actionDoc('core:spec/rewrite', { actions: [roll({ key: 'rewrite', function: 'rewrite', slash: 'edit' })] }),
			/'\/edit' is claimed twice/,
		)
	})

	test('claiming it for the same function is an alternative, and the seed reaches every genre', () => {
		const same = actionsOf(actionDoc('core:spec/retry-again', { actions: [roll({ key: 'retry', function: 'retry', slash: 'retry' })] }))
		assert.deepEqual(slashCollisions(same), [])
		const adventure = actionsOf(actionDoc('core:spec/adv-redo', { actions: [roll({ key: 'redo', function: 'redo', genre: 'core:genre/adventure' })] }))
		assert.deepEqual(slashCollisions(adventure), [])
		const clash = actionsOf({ ...actionDoc('core:spec/adv-redo', { actions: [roll({ key: 'redo', function: 'redo', genre: 'core:genre/adventure' })] }), contributes: { actions: [roll({ key: 'redo', function: 'redo', genre: 'core:genre/adventure', slash: 'continue' })] } })
		assert.equal(slashCollisions(clash).length, 1)
		assert.match(slashCollisions(clash)[0]!, /for genre 'core:genre\/adventure': by 'core' for 'continue'/)
	})
})

describe('R-15 · the triggers alias normalises', () => {
	test('a trigger becomes an action: mode → genre, i18n → label, bare venue → list, key from function', () => {
		const doc = actionDoc('core:spec/old', {
			triggers: [{ mode: CHAT, function: 'old', venue: 'composer', icon: 'pencil', i18n: { en: 'Old' } }],
		})
		assert.equal((doc.contributes as any).triggers, undefined)
		const [a] = actionsOf(doc)
		assert.deepEqual(a, {
			key: 'old',
			function: 'old',
			genre: CHAT,
			venue: [{ kind: 'composer' }],
			icon: 'pencil',
			label: { en: 'Old' },
			specId: 'core:spec/old',
		})
	})

	test('a trigger with no i18n keeps loading — its label is derived, one release', () => {
		const doc = actionDoc('core:spec/old', {
			triggers: [{ genre: CHAT, function: 'old', venue: 'message' }],
		})
		assert.deepEqual(actionsOf(doc)[0]!.label, { en: 'old' })
	})

	test('normalizeContributes keeps whatever else contributes carried', () => {
		const out = normalizeContributes({ other: 1, triggers: [{ function: 'x', venue: 'composer' }] } as any)
		assert.equal((out as any).other, 1)
		assert.equal((out as any).triggers, undefined)
		assert.equal((out as any).actions[0].key, 'x')
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

	test('every core verb lives at the message venue; retry and continue also at extra', () => {
		for (const a of CORE_ACTIONS) {
			assert.ok(a.venue.some((v) => v.kind === 'message'), a.key)
			const extra = a.venue.some((v) => v.kind === 'extra')
			assert.equal(extra, a.key === 'retry' || a.key === 'continue', a.key)
		}
	})

	test('the slash names core claims are bare, and only continue and retry claim one', () => {
		for (const a of CORE_ACTIONS) {
			if (a.slash) assert.match(a.slash, /^[a-z][a-z0-9-]*$/)
			assert.equal(!!a.slash, a.key === 'continue' || a.key === 'retry', a.key)
		}
	})

	test('every label is a locale map with en, and the audience names participant references', () => {
		for (const a of CORE_ACTIONS) {
			assert.equal(typeof (a.label as any).en, 'string', a.key)
			assert.ok(a.audience && a.audience.act.length && a.audience.see.length, a.key)
		}
	})

	test('a core spec may not redeclare a verb under a different meaning — the table is the fact', () => {
		// Not enforced at construction (a plugin cannot reach `function: 'edit'`
		// through `sessions:triggerFunction` anyway); pinned as a fact about the
		// table: every core verb is a built-in, never routed as a function.
		for (const a of CORE_ACTIONS) assert.equal(a.function, a.key)
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
